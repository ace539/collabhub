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
