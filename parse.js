/* collabhub — paste parser
   Takes messy pasted text (an X post, a Discord announcement, a mint listing)
   and pulls out structured project fields. Heuristic, not magic: it fills what
   it's confident about and leaves the rest for you to correct.  */
(function () {
  var MON = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };
  var CHAINS = [
    [/\bhood\b|robinhood/i, "HOOD"], [/\bgiwa\b/i, "GIWA"], [/\bsol(ana)?\b/i, "SOL"],
    [/\beth(ereum)?\b/i, "ETH"], [/\bbase\b/i, "BASE"], [/\bbtc|bitcoin|ordinal/i, "BTC"],
    [/\bmonad\b/i, "MONAD"], [/\babstract\b/i, "ABSTRACT"], [/\bberachain|bera\b/i, "BERA"],
    [/omnichain/i, "OMNICHAIN"], [/\bapechain|ape\b/i, "APE"], [/\bblast\b/i, "BLAST"]
  ];

  function year() { return new Date().getFullYear(); }

  function findDate(t) {
    var m = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?!\d)/i);
    if (m) {
      var mo = MON[m[1].toLowerCase()], d = +m[2];
      var y = year();
      // if the month already passed by more than a month, assume next year
      var now = new Date();
      if (mo < now.getMonth() - 0) y = now.getMonth() + 1 > mo + 1 ? y + 1 : y;
      return y + "-" + String(mo).padStart(2, "0") + "-" + String(d).padStart(2, "0");
    }
    m = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (m) return m[0];
    m = t.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
    if (m) {
      var yy = m[3].length === 2 ? "20" + m[3] : m[3];
      return yy + "-" + String(+m[1]).padStart(2, "0") + "-" + String(+m[2]).padStart(2, "0");
    }
    if (/\btoday\b/i.test(t)) return new Date().toISOString().slice(0, 10);
    if (/\btomorrow\b/i.test(t)) return new Date(Date.now() + 864e5).toISOString().slice(0, 10);
    return "";
  }

  /* every date in the text, with where it sits, so mint and deadline
     can be told apart instead of both taking the first one */
  function findDates(t) {
    var out = [], re, m, y, mo, d, now = new Date();
    re = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?!\d)/gi;
    while ((m = re.exec(t))) {
      mo = MON[m[1].toLowerCase()]; d = +m[2]; y = year();
      if (mo < now.getMonth() + 1 - 1) y = y + 1;
      out.push({ iso: y + "-" + String(mo).padStart(2, "0") + "-" + String(d).padStart(2, "0"), at: m.index });
    }
    re = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
    while ((m = re.exec(t))) out.push({ iso: m[0], at: m.index });
    re = /\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g;
    while ((m = re.exec(t))) {
      var yy = m[3].length === 2 ? "20" + m[3] : m[3];
      out.push({ iso: yy + "-" + String(+m[1]).padStart(2, "0") + "-" + String(+m[2]).padStart(2, "0"), at: m.index });
    }
    if (/\btoday\b/i.test(t)) out.push({ iso: new Date().toISOString().slice(0, 10), at: t.search(/\btoday\b/i) });
    if (/\btomorrow\b/i.test(t)) out.push({ iso: new Date(Date.now() + 864e5).toISOString().slice(0, 10), at: t.search(/\btomorrow\b/i) });
    out.sort(function (a, b) { return a.at - b.at; });
    return out;
  }

  var DEADLINE_RE = /\b(deadline|closes?|closing|ends?|ending|apply by|submit by|until|submission|last day|cut ?off)\b/i;
  var MINT_RE = /\b(mint(s|ing)?|launch(es|ing)?|drops?|dropping|go(es)? live|public sale|reveal)\b/i;

  /* which keyword sits closest to this date */
  function flavour(t, at) {
    var w = t.slice(Math.max(0, at - 60), at + 60);
    var dl = w.search(DEADLINE_RE), mi = w.search(MINT_RE);
    if (dl === -1 && mi === -1) return "";
    if (dl === -1) return "mint";
    if (mi === -1) return "deadline";
    var here = at - Math.max(0, at - 60);
    return Math.abs(dl - here) <= Math.abs(mi - here) ? "deadline" : "mint";
  }

  /* returns { mint, deadline } — never copies one into the other */
  function splitDates(t) {
    var ds = findDates(t), mint = "", deadline = "", spare = [];
    ds.forEach(function (d) {
      var f = flavour(t, d.at);
      if (f === "deadline" && !deadline) deadline = d.iso;
      else if (f === "mint" && !mint) mint = d.iso;
      else spare.push(d.iso);
    });
    if (!mint && !deadline && spare.length) {
      if (DEADLINE_RE.test(t) && !MINT_RE.test(t)) deadline = spare.shift();
      else mint = spare.shift();
    }
    /* a deadline after the mint date is almost always a misread */
    if (mint && deadline && deadline > mint) {
      if (spare.length) deadline = spare.filter(function (x) { return x <= mint; })[0] || "";
      else deadline = "";
    }
    return { mint: mint, deadline: deadline };
  }

  function findTime(t) {
    var m = t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(utc|est|pst|gmt|cet)\b/i);
    if (!m) return "";
    return m[0].trim().toUpperCase();
  }

  function findPrice(t) {
    if (/\bfree\s*mint\b|\bfreemint\b|\bfree\b(?!\s*(mint\s*)?(spot|wl))/i.test(t) && !/not free/i.test(t)) {
      var g = /gas\s*only/i.test(t) ? "FREE (gas only)" : "FREE";
      if (/\d+(\.\d+)?\s*(eth|sol|btc)/i.test(t)) { /* both free + paid phases */ }
      else return g;
    }
    var m = t.match(/(\d+(?:\.\d+)?)\s*(eth|sol|btc|usdc|matic)\b/i);
    if (m) return m[1] + " " + m[2].toUpperCase();
    m = t.match(/\$(\d+(?:\.\d+)?)/);
    if (m) return "$" + m[1];
    if (/\bfree\b/i.test(t)) return "FREE";
    return "TBA";
  }

  function findSupply(t) {
    var m = t.match(/\b(\d{1,3}(?:,\d{3})+|\d{3,6})\s*(?:supply|total|pieces|nfts?|items?|collectibles?)\b/i);
    if (m) return m[1];
    m = t.match(/\bsupply[:\s]+(\d{1,3}(?:,\d{3})+|\d{2,6})\b/i);
    if (m) return m[1];
    m = t.match(/\b(\d{1,3}(?:,\d{3})+)\b/);
    if (m) return m[1];
    return "TBA";
  }

  function findSpots(t) {
    var m = t.match(/\b(\d{1,4})\s*(?:wl|whitelist|allowlist|al)?\s*spots?\b/i);
    if (m) return m[1];
    m = t.match(/\b(\d{1,4})\s*(?:winners?|spots? available)\b/i);
    if (m) return m[1];
    m = t.match(/\bgiving away\s*(\d{1,4})\b/i);
    if (m) return m[1];
    return "";
  }

  function findHandles(t) {
    var out = [], re = /@([A-Za-z0-9_]{2,15})\b/g, m;
    while ((m = re.exec(t))) if (out.indexOf("@" + m[1]) === -1) out.push("@" + m[1]);
    return out;
  }

  function findLinks(t) {
    var out = [], re = /https?:\/\/[^\s)"'<>]+/g, m;
    while ((m = re.exec(t))) out.push(m[0].replace(/[.,;:]+$/, ""));
    return out;
  }

  function findChain(t) {
    for (var i = 0; i < CHAINS.length; i++) if (CHAINS[i][0].test(t)) return CHAINS[i][1];
    return "";
  }

  /* the project name is the hardest part — try, in order:
     an explicit "X is minting" pattern, a quoted name, the first line,
     then the first @handle stripped of punctuation */
  function findName(t, handles) {
    var m = t.match(/^\s*([A-Z][\w'&.\- ]{2,40}?)\s+(?:is |mint|drops?|launch)/m);
    /* only trust it when the capture reads like a name — no double spaces,
       no digits, so "Puffpals   Sep 4   free mint" can't slip through */
    if (m && !/\s{2,}|\d/.test(m[1])) return m[1].trim();
    m = t.match(/["“]([^"”]{3,40})["”]/);
    if (m) return m[1].trim();
    var first = t.split(/\n/).map(function (l) { return l.trim(); }).filter(Boolean)[0] || "";
    first = first.replace(/https?:\/\/\S+/g, "").replace(/[#@]\S+/g, "").trim();
    first = first.replace(/^(gm|introducing|announcing|presenting)[\s:,-]+/i, "");
    /* trim everything after the name: delimiters first, then any date /
       price / supply fragment left clinging to it */
    first = first.split(/\s*[|•·∙‧・›»–—]\s*|\t+|\s{2,}/)[0].trim();
    first = first.replace(/\s+-\s+.*$/, "").trim();
    first = first.replace(/[,;:]?\s*\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(st|nd|rd|th)?\b.*$/i, "").trim();
    first = first.replace(/[,;:]?\s*\b\d{4}-\d{2}-\d{2}\b.*$/, "").trim();
    first = first.replace(/[,;:]?\s*\b\d+(\.\d+)?\s*(eth|sol|btc|matic|ape|usdc?)\b.*$/i, "").trim();
    first = first.replace(/[,;:]?\s*\b(free\s*mint|free|gas\s*only|tba)\b.*$/i, "").trim();
    first = first.replace(/[,;:]?\s*\b\d{1,3}(,\d{3})+\b.*$/, "").trim();
    first = first.replace(/[,;:]?\s*\b\d{3,6}\s*(supply|total|pieces|items?|nfts?)\b.*$/i, "").trim();
    first = first.replace(/[·•|,;:\-–—\s]+$/, "").trim();
    if (first.length >= 3 && first.length <= 48 && /[a-z]/i.test(first)) {
      return first.replace(/\s{2,}/g, " ");
    }
    if (handles.length) return handles[0].slice(1);
    return "";
  }

  /* requirement detection — maps phrases to the giveaway requirement types */
  function findRequirements(t) {
    var reqs = [];
    var handles = findHandles(t);
    if (/\bfollow\b/i.test(t)) {
      var seg = t.match(/follow[^.\n]{0,120}/ig) || [];
      var f = [];
      seg.forEach(function (s) { findHandles(s).forEach(function (h) { if (f.indexOf(h) === -1) f.push(h); }); });
      if (!f.length && handles.length) f = handles.slice(0, 2);
      if (f.length) reqs.push({ type: "follow", targets: f, label: "Follow " + f.join(", ") });
    }
    if (/\b(rt|retweet|repost)\b/i.test(t)) reqs.push({ type: "retweet", targets: [], label: "Retweet the post" });
    if (/\b(like|❤)\b/i.test(t)) reqs.push({ type: "like", targets: [], label: "Like the post" });
    if (/\b(comment|reply|drop your|tag \d)\b/i.test(t)) {
      var tag = t.match(/tag\s*(\d)/i);
      reqs.push({ type: "comment", targets: [], label: tag ? "Comment tagging " + tag[1] + " friends" : "Comment on the post" });
    }
    if (/\bquote\s*(post|tweet|rt)\b/i.test(t)) reqs.push({ type: "quote", targets: [], label: "Quote post it" });
    if (/\bjoin\b[^.\n]{0,40}\b(discord|server)\b/i.test(t)) reqs.push({ type: "discord", targets: [], label: "Join the Discord" });
    if (/\bjoin\b[^.\n]{0,40}\b(telegram|tg)\b/i.test(t) || /t\.me\//i.test(t)) reqs.push({ type: "telegram", targets: [], label: "Join the Telegram" });
    if (/\bhold(ing|ers?)?\b/i.test(t)) {
      var h = t.match(/hold(?:ing|ers?)?[^.\n]{0,80}/i);
      reqs.push({ type: "hold", targets: [], label: h ? h[0].trim().replace(/\s{2,}/g, " ") : "Hold a partner NFT" });
    }
    if (/\bwallet\b[^.\n]{0,30}\b(submit|form|drop)\b/i.test(t) || /\bsubmit\b[^.\n]{0,30}\bwallet\b/i.test(t)) {
      reqs.push({ type: "wallet", targets: [], label: "Submit your wallet address" });
    }
    return reqs;
  }

  function parse(text) {
    var t = String(text || "").replace(/\r/g, "");
    if (!t.trim()) return null;
    var handles = findHandles(t);
    var links = findLinks(t);
    var date = findDate(t);
    var time = findTime(t);
    var reqs = findRequirements(t);
    var chain = findChain(t);
    var xLink = links.filter(function (l) { return /(^|\.)x\.com|twitter\.com/i.test(l); })[0] || "";
    var tgLink = links.filter(function (l) { return /t\.me/i.test(l); })[0] || "";
    var dcLink = links.filter(function (l) { return /discord/i.test(l); })[0] || "";

    var dates = splitDates(t);

    var fields = {
      project: findName(t, handles),
      chain: chain,
      manager: handles[0] || "",
      dm: handles[0] ? "https://x.com/" + handles[0].slice(1) : "",
      x: xLink || (handles[0] ? "https://x.com/" + handles[0].slice(1) : ""),
      tg: tgLink,
      discord: dcLink,
      spots: findSpots(t),
      supply: findSupply(t),
      price: findPrice(t),
      mint: dates.mint,
      deadline: dates.deadline,
      time: time,
      giveaway: /\bgiveaway|\braffle\b|\bwl\b|\bwhitelist\b|\ballowlist\b/i.test(t),
      requirements: reqs,
      rules: reqs.map(function (r) { return r.label; }).join(" · "),
      notes: t.trim().slice(0, 400),
      handles: handles,
      links: links
    };

    /* confidence: how much did we actually find? */
    var got = 0, total = 6;
    if (fields.project) got++;
    if (fields.chain) got++;
    if (fields.price !== "TBA") got++;
    if (fields.supply !== "TBA") got++;
    if (date) got++;
    if (reqs.length) got++;
    fields.confidence = Math.round(got / total * 100);
    return fields;
  }

  window.CollabParse = { parse: parse, splitDates: splitDates, findRequirements: findRequirements, findHandles: findHandles };
})();
