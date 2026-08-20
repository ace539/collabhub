/* collabhub data layer
   Works in two modes:
     local  — browser storage (default, no setup)
     cloud  — Supabase, once a URL + anon key are saved in the admin panel
   Every page talks to window.CollabDB and never to storage directly. */
(function () {
  var CFG = "collabhub.supabase";
  var client = null;

  /* Your Supabase project. Safe to keep here: the anon key only works through
     the row-level security rules in supabase/schema.sql. Never put the
     service_role key in this file. */
  var DEFAULTS = {
    url: "https://flonqslgddegprvkiitd.supabase.co",
    key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZsb25xc2xnZGRlZ3BydmtpaXRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MjkxNjEsImV4cCI6MjEwMjAwNTE2MX0.U_XqGpmteVNmZHCe3GwfZA-BsmYWpt7DTWeZ3iGrD4k"
  };

  function readCfg() {
    try {
      var v = JSON.parse(localStorage.getItem(CFG) || "null");
      if (v && v.url && v.key) return v;
      if (v && v.off) return null;
    } catch (e) {}
    return DEFAULTS.url ? DEFAULTS : null;
  }
  function lsGet(k, f) {
    try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch (e) { return f; }
  }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  var K = {
    posts: "collabhub.feed.v1",
    projects: "collabhub.projects.v1",
    trends: "collabhub.xtrends.v1"
  };

  function connect() {
    var c = readCfg();
    if (!c || !c.url || !c.key || !window.supabase) { client = null; return false; }
    try { client = window.supabase.createClient(c.url, c.key); return true; }
    catch (e) { client = null; return false; }
  }
  connect();

  /* ---------- row shape translation ---------- */
  var toPost = function (r) {
    return {
      id: r.id, type: r.type, project: r.project || "", chain: r.chain || "",
      title: r.title, body: r.body || "", manager: r.manager || "",
      deadline: r.deadline || "", link: r.link || "", author: r.author || "@anon",
      votes: r.votes || 0, reports: r.reports || 0, pinned: !!r.pinned,
      ts: r.created_at ? new Date(r.created_at).getTime() : Date.now()
    };
  };
  var fromPost = function (p) {
    return {
      type: p.type, project: p.project || null, chain: p.chain || null,
      title: p.title, body: p.body || null, manager: p.manager || null,
      deadline: p.deadline || null, link: p.link || null, author: p.author, votes: 1
    };
  };
  var toProject = function (r) {
    return {
      id: r.id, project: r.name, chain: r.chain || "—", manager: r.manager || "—",
      dm: r.dm_link || "", spots: r.spots || "—", deadline: r.deadline || "",
      mint: r.mint_date || "", price: r.price || "—", supply: r.supply || "—",
      hype: r.hype == null ? 5 : r.hype, rules: r.rules || "", notes: r.notes || "",
      x: r.x_url || "", tg: r.tg_url || "", giveaway: !!r.giveaway,
      addedBy: r.added_by || "", ts: r.created_at ? new Date(r.created_at).getTime() : Date.now()
    };
  };
  var fromProject = function (p) {
    return {
      name: p.project, chain: p.chain || null, manager: p.manager || null,
      dm_link: p.dm || null, spots: p.spots || null,
      deadline: p.deadline || null, mint_date: p.mint || null,
      price: p.price || null, supply: p.supply || null, hype: p.hype || 5,
      rules: p.rules || null, notes: p.notes || null,
      x_url: p.x || null, tg_url: p.tg || null, giveaway: !!p.giveaway
    };
  };
  var toTrend = function (r) { return { id: r.id, tag: r.tag, meta: r.meta || "", delta: r.delta || "" }; };

  /* ---------- generic local list helpers ---------- */
  function localList(key, seed) {
    var v = lsGet(key, null);
    return v == null ? (seed || []) : v;
  }

  /* a Supabase "table doesn't exist" error, as opposed to a real failure */
  function missing(err) {
    return /schema cache|does not exist|Could not find the (table|function)/i.test(err.message || "");
  }
  function fail(err) {
    if (missing(err)) {
      DB.missingTables = true;
      return { ok: false, missing: true,
               msg: "The giveaway tables aren't in your database yet — run supabase/patch-02-giveaways.sql." };
    }
    return { ok: false, msg: err.message || "Write failed." };
  }

  var DB = {
    mode: function () { return client ? "cloud" : "local"; },
    config: readCfg,

    saveConfig: function (url, key) {
      lsSet(CFG, { url: (url || "").trim(), key: (key || "").trim() });
      return connect();
    },
    clearConfig: function () {
      lsSet(CFG, { off: true });
      client = null;
    },
    test: function () {
      if (!client) return Promise.resolve({ ok: false, msg: "No URL/key saved yet." });
      return client.from("posts").select("id").limit(1).then(function (r) {
        if (r.error) return { ok: false, msg: r.error.message };
        return { ok: true, msg: "Connected. Tables reachable." };
      }).catch(function (e) { return { ok: false, msg: String(e.message || e) }; });
    },

    /* ---------------- POSTS ---------------- */
    listPosts: function (seed) {
      if (!client) return Promise.resolve(localList(K.posts, seed));
      return client.from("posts").select("*").order("created_at", { ascending: false })
        .then(function (r) { return r.error ? localList(K.posts, seed) : r.data.map(toPost); });
    },
    createPost: function (p, current) {
      if (!client) { var n = [p].concat(current); lsSet(K.posts, n); return Promise.resolve(n); }
      return client.from("posts").insert(fromPost(p)).select().single()
        .then(function (r) { return r.error ? current : [toPost(r.data)].concat(current); });
    },
    deletePost: function (id, current) {
      var n = current.filter(function (x) { return x.id !== id; });
      if (!client) { lsSet(K.posts, n); return Promise.resolve(n); }
      return client.from("posts").delete().eq("id", id).then(function () { return n; });
    },
    updatePost: function (id, patch, current) {
      var n = current.map(function (x) { return x.id === id ? Object.assign({}, x, patch) : x; });
      if (!client) { lsSet(K.posts, n); return Promise.resolve(n); }
      return client.from("posts").update(patch).eq("id", id).then(function () { return n; });
    },
    votePost: function (id, current) {
      var n = current.map(function (x) { return x.id === id ? Object.assign({}, x, { votes: (x.votes || 0) + 1 }) : x; });
      if (!client) { lsSet(K.posts, n); return Promise.resolve(n); }
      return client.rpc("vote_post", { p_id: id }).then(function () { return n; });
    },
    reportPost: function (id, current) {
      var n = current.map(function (x) { return x.id === id ? Object.assign({}, x, { reports: (x.reports || 0) + 1 }) : x; });
      if (!client) { lsSet(K.posts, n); return Promise.resolve(n); }
      return client.rpc("report_post", { p_id: id }).then(function () { return n; });
    },

    /* ---------------- PROJECTS ---------------- */
    listProjects: function (seed) {
      if (!client) return Promise.resolve(localList(K.projects, seed));
      return client.from("projects").select("*").order("created_at", { ascending: false })
        .then(function (r) { return r.error ? localList(K.projects, seed) : r.data.map(toProject); });
    },
    createProject: function (p, current) {
      if (!client) { var n = [p].concat(current); lsSet(K.projects, n); return Promise.resolve(n); }
      return client.from("projects").insert(fromProject(p)).select().single()
        .then(function (r) { return r.error ? current : [toProject(r.data)].concat(current); });
    },
    deleteProject: function (id, current) {
      var n = current.filter(function (x) { return x.id !== id; });
      if (!client) { lsSet(K.projects, n); return Promise.resolve(n); }
      return client.from("projects").delete().eq("id", id).then(function () { return n; });
    },

    /* ---------------- TRENDS ---------------- */
    listTrends: function (seed) {
      if (!client) return Promise.resolve(localList(K.trends, seed));
      return client.from("trends").select("*").order("position", { ascending: true })
        .then(function (r) { return r.error ? localList(K.trends, seed) : r.data.map(toTrend); });
    },
    createTrend: function (t, current) {
      if (!client) { var n = current.concat([t]); lsSet(K.trends, n); return Promise.resolve(n); }
      return client.from("trends").insert({ tag: t.tag, meta: t.meta, delta: t.delta, position: current.length })
        .select().single()
        .then(function (r) { return r.error ? current : current.concat([toTrend(r.data)]); });
    },
    deleteTrend: function (id, current) {
      var n = current.filter(function (x) { return x.id !== id; });
      if (!client) { lsSet(K.trends, n); return Promise.resolve(n); }
      return client.from("trends").delete().eq("id", id).then(function () { return n; });
    },

    /* ---------------- PRIVATE (per member, still local) ---------------- */
    listWallets: function (memberId, seed) { return localList("collabhub.wallets." + memberId, seed); },
    saveWallets: function (memberId, v) { lsSet("collabhub.wallets." + memberId, v); },
    listWl: function (memberId, seed) { return localList("collabhub.wl." + memberId, seed); },
    saveWl: function (memberId, v) { lsSet("collabhub.wl." + memberId, v); },

    /* ---------------- GIVEAWAYS ----------------
       Every write returns {ok, msg, list} so callers can show real errors.
       missingTables goes true when Supabase says the tables aren't there,
       which is the difference between "nothing yet" and "you skipped a step". */
    missingTables: false,

    listGiveaways: function () {
      if (!client) return Promise.resolve(lsGet("collabhub.giveaways", []));
      return client.from("giveaways").select("*").order("created_at", { ascending: false })
        .then(function (r) {
          if (r.error) {
            DB.missingTables = missing(r.error);
            return lsGet("collabhub.giveaways", []);
          }
          DB.missingTables = false;
          return r.data;
        });
    },
    createGiveaway: function (g) {
      if (!client) {
        var cur = lsGet("collabhub.giveaways", []);
        g.id = "g" + Date.now(); g.created_at = new Date().toISOString();
        cur.unshift(g); lsSet("collabhub.giveaways", cur);
        return Promise.resolve({ ok: true, msg: "Created (saved in this browser).", list: cur });
      }
      return client.from("giveaways").insert(g).select().then(function (r) {
        if (r.error) return fail(r.error);
        return DB.listGiveaways().then(function (list) {
          return { ok: true, msg: "Live — it's on the public page now.", list: list };
        });
      });
    },
    updateGiveaway: function (id, patch) {
      if (!client) {
        var cur = lsGet("collabhub.giveaways", []).map(function (x) { return x.id === id ? Object.assign({}, x, patch) : x; });
        lsSet("collabhub.giveaways", cur);
        return Promise.resolve({ ok: true, msg: "Updated.", list: cur });
      }
      return client.from("giveaways").update(patch).eq("id", id).then(function (r) {
        if (r.error) return fail(r.error);
        return DB.listGiveaways().then(function (list) { return { ok: true, msg: "Updated.", list: list }; });
      });
    },
    deleteGiveaway: function (id) {
      if (!client) {
        var cur = lsGet("collabhub.giveaways", []).filter(function (x) { return x.id !== id; });
        lsSet("collabhub.giveaways", cur);
        return Promise.resolve({ ok: true, msg: "Deleted.", list: cur });
      }
      return client.from("giveaways").delete().eq("id", id).then(function (r) {
        if (r.error) return fail(r.error);
        return DB.listGiveaways().then(function (list) { return { ok: true, msg: "Deleted.", list: list }; });
      });
    },

    /* ---------------- ENTRIES ---------------- */
    listEntries: function (giveawayId) {
      if (!client) {
        return Promise.resolve(lsGet("collabhub.entries", []).filter(function (e) {
          return !giveawayId || e.giveaway_id === giveawayId;
        }));
      }
      var q = client.from("entries").select("*").order("created_at", { ascending: false });
      if (giveawayId) q = q.eq("giveaway_id", giveawayId);
      return q.then(function (r) {
        if (r.error) { if (missing(r.error)) DB.missingTables = true; return []; }
        return r.data;
      });
    },
    enter: function (e) {
      if (!client) {
        var cur = lsGet("collabhub.entries", []);
        if (cur.some(function (x) { return x.giveaway_id === e.giveaway_id && x.handle.toLowerCase() === e.handle.toLowerCase(); })) {
          return Promise.resolve({ ok: false, msg: "That handle already entered." });
        }
        e.id = "e" + Date.now(); e.created_at = new Date().toISOString();
        cur.unshift(e); lsSet("collabhub.entries", cur);
        return Promise.resolve({ ok: true, msg: "Entered." });
      }
      return client.from("entries").insert(e).then(function (r) {
        if (r.error) {
          if (missing(r.error)) return fail(r.error);
          return { ok: false, msg: /duplicate|unique/i.test(r.error.message) ? "That handle already entered." : r.error.message };
        }
        return { ok: true, msg: "Entered." };
      });
    },
    updateEntry: function (id, patch) {
      if (!client) {
        var cur = lsGet("collabhub.entries", []).map(function (x) { return x.id === id ? Object.assign({}, x, patch) : x; });
        lsSet("collabhub.entries", cur);
        return Promise.resolve({ ok: true, msg: "Updated." });
      }
      return client.from("entries").update(patch).eq("id", id)
        .then(function (r) { return r.error ? fail(r.error) : { ok: true, msg: "Updated." }; });
    },
    deleteEntry: function (id) {
      if (!client) {
        lsSet("collabhub.entries", lsGet("collabhub.entries", []).filter(function (x) { return x.id !== id; }));
        return Promise.resolve({ ok: true, msg: "Removed." });
      }
      return client.from("entries").delete().eq("id", id)
        .then(function (r) { return r.error ? fail(r.error) : { ok: true, msg: "Removed." }; });
    },
    drawWinners: function (giveawayId, n) {
      if (!client) {
        var all = lsGet("collabhub.entries", []);
        var pool = all.filter(function (e) { return e.giveaway_id === giveawayId && e.verified; });
        for (var i = pool.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
        var win = pool.slice(0, n).map(function (e) { return e.id; });
        lsSet("collabhub.entries", all.map(function (e) {
          return e.giveaway_id === giveawayId ? Object.assign({}, e, { won: win.indexOf(e.id) !== -1 }) : e;
        }));
        var gs = lsGet("collabhub.giveaways", []).map(function (g) { return g.id === giveawayId ? Object.assign({}, g, { status: "drawn" }) : g; });
        lsSet("collabhub.giveaways", gs);
        return Promise.resolve({ ok: true, winners: pool.slice(0, n) });
      }
      return client.rpc("draw_winners", { g_id: giveawayId, n: n }).then(function (r) {
        return r.error ? fail(r.error) : { ok: true, winners: r.data || [] };
      });
    },

    /* ---- one-time push of local starter data into an empty database ---- */
    seed: function (projects, trends) {
      if (!client) return Promise.resolve({ ok: false, msg: "Not connected." });
      return client.from("projects").select("id").limit(1).then(function (r) {
        if (r.error) return { ok: false, msg: r.error.message };
        if (r.data && r.data.length) return { ok: false, msg: "Database already has projects — nothing pushed." };
        var jobs = [];
        if (projects && projects.length) jobs.push(client.from("projects").insert(projects.map(fromProject)));
        if (trends && trends.length) jobs.push(client.from("trends").insert(
          trends.map(function (t, i) { return { tag: t.tag, meta: t.meta, delta: t.delta, position: i }; })
        ));
        return Promise.all(jobs).then(function (res) {
          var bad = res.filter(function (x) { return x && x.error; })[0];
          return bad ? { ok: false, msg: bad.error.message }
                     : { ok: true, msg: "Pushed " + (projects || []).length + " projects and " + (trends || []).length + " trends." };
        });
      });
    },

    /* ---------------- REALTIME ---------------- */    watch: function (tables, cb) {
      if (!client) return function () {};
      var ch = client.channel("collabhub-" + Math.random().toString(36).slice(2));
      tables.forEach(function (t) {
        ch.on("postgres_changes", { event: "*", schema: "public", table: t }, function () { cb(t); });
      });
      ch.subscribe();
      return function () { try { client.removeChannel(ch); } catch (e) {} };
    }
  };

  window.CollabDB = DB;
})();
