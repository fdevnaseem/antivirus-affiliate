/*
 * Learning tracker for ShieldPick (antivirus-affiliate).
 *
 * What it does, in one place:
 *  - Listens for clicks once, on the whole document, instead of adding a
 *    handler to every button. New buttons work automatically if they use
 *    the same data-* attributes.
 *  - Stores events in this browser's localStorage so dashboard.html can
 *    show them. That is the learning limit: localStorage is per browser,
 *    so this is NOT all visitors. GA4 (Phase 2) or a small backend
 *    (Phase 4) is what turns this into all-visitor data.
 *  - If window.gtag exists (GA4 added later), it forwards the same event
 *    to GA4 with the same name and parameters.
 *
 * What it never stores: phone numbers, emails, full URLs with query
 * strings, or affiliate parameters. Only the brand, plan, location and
 * page are stored. That is deliberate, for privacy.
 */

(function () {
  "use strict";

  var STORAGE_KEY = "shieldpick_events_v1";
  var MAX_EVENTS = 1000;

  function pageName() {
    var path = window.location.pathname || "/";
    var file = path.split("/").pop();
    return file || "index.html";
  }

  function referrerHost() {
    try {
      return document.referrer ? new URL(document.referrer).hostname : "";
    } catch (e) {
      return "";
    }
  }

  function getEvents() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function saveEvents(events) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(0, MAX_EVENTS)));
    } catch (e) {
      /* Storage full or blocked: tracking must never break the page. */
    }
  }

  function track(eventName, params) {
    var event = {
      ts: new Date().toISOString(),
      event: eventName,
      page: pageName(),
      referrer: referrerHost(),
    };
    var clean = params || {};
    Object.keys(clean).forEach(function (key) {
      if (clean[key] !== undefined && clean[key] !== null && clean[key] !== "") {
        event[key] = String(clean[key]);
      }
    });

    var events = getEvents();
    events.unshift(event);
    saveEvents(events);

    /* Forward to GA4 when it is present. Same name, same parameters. */
    if (typeof window.gtag === "function") {
      var gtagParams = {};
      Object.keys(event).forEach(function (key) {
        if (key !== "ts") gtagParams[key] = event[key];
      });
      window.gtag("event", eventName, gtagParams);
    }

    if (window.console && typeof window.console.debug === "function") {
      window.console.debug("[track]", event);
    }
    return event;
  }

  /* Location: prefer an explicit data-location, otherwise infer it from
   * the nearest section / header / footer / deal card. This is why
   * index.html needs no edits on every button, only the script tag. */
  function locationFor(el) {
    if (el.dataset && el.dataset.location) return el.dataset.location;
    var section = el.closest("section");
    if (section && section.id) return section.id;
    if (el.closest("header")) return "header";
    if (el.closest("footer")) return "footer";
    return "unknown";
  }

  function planFor(link) {
    if (link.dataset && link.dataset.plan) return link.dataset.plan;
    var card = link.closest("article.deal");
    if (card) {
      var heading = card.querySelector("h3");
      if (heading) return heading.textContent.trim();
    }
    return "";
  }

  document.addEventListener("click", function (e) {
    var target = e.target && e.target.closest ? e.target.closest("a, button") : null;
    if (!target) return;

    var href = target.getAttribute("href") || "";

    /* Call tap: a tap is NOT proof a call happened. It is only a tap.
     * Real answered-call counting needs a forwarding number or a
     * call-tracking provider. See test-call.html and dashboard.html. */
    if (href.indexOf("tel:") === 0) {
      track("call_click", { location: locationFor(target), label: "test-call" });
      return;
    }

    /* Outbound affiliate button. data-offer is already set by main.js. */
    if (target.dataset && target.dataset.offer) {
      track("cta_click", {
        brand: target.dataset.offer,
        plan: planFor(target),
        location: locationFor(target),
        text: target.textContent.trim(),
      });
      return;
    }

    /* Any other explicitly tracked link, e.g. data-track="nav_click". */
    if (target.dataset && target.dataset.track) {
      track(target.dataset.track, {
        location: locationFor(target),
        text: target.textContent.trim(),
      });
      return;
    }

    /* Deal filter buttons. */
    if (target.dataset && target.dataset.filter) {
      track("filter_click", { brand: target.dataset.filter });
    }
  });

  /* Quiz: track once per new pick, not once per radio click. */
  var picker = document.querySelector("#picker-form");
  var verdict = document.querySelector("#verdict");
  var lastPick = "";
  if (picker && verdict) {
    picker.addEventListener("change", function () {
      if (verdict.hidden) return;
      var nameEl = verdict.querySelector(".verdict-name");
      var pick = nameEl ? nameEl.textContent.trim() : "";
      if (pick && pick !== lastPick) {
        lastPick = pick;
        track("quiz_complete", { pick: pick, location: "fit" });
      }
    });
  }

  /* Contact form: this only records the attempt. The form still needs
   * a real action (Formspree / Netlify Forms / own endpoint) to send. */
  var contact = document.querySelector("#contact-form");
  if (contact) {
    contact.addEventListener("submit", function () {
      track("contact_submit", { location: "contact" });
    });
  }

  /* One page_view per page load. CTR in the dashboard is
   * cta_click / page_view, so page_view must exist. */
  track("page_view", {});

  /* Console helpers for learning: try ShieldPickTrack.getEvents() */
  window.ShieldPickTrack = {
    track: track,
    getEvents: getEvents,
    clearEvents: function () {
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch (e) {}
    },
    storageKey: STORAGE_KEY,
  };
})();
