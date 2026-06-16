/**
 * inject.js - Chamber Protocol GraphQL Network Interceptor
 * 
 * Runs in the main world context of the page to intercept outgoing fetch and XHR requests,
 * targeting Facebook's internal GraphQL mutation flows for post creations.
 */
(function() {
  const PROTOCOL_VERSION = "2026-v1";
  console.log("[Chamber] GraphQL network interceptor active.");

  // Helper to inspect request parameters and extract post metadata
  function inspectGraphQLRequest(bodyText) {
    try {
      // Facebook GraphQL requests are typically application/x-www-form-urlencoded or multipart
      // with parameters like fb_api_req_friendly_name, variables, etc.
      const params = new URLSearchParams(bodyText);
      const friendlyName = params.get("fb_api_req_friendly_name");
      const variablesStr = params.get("variables");

      if (!variablesStr) return;
      const variables = JSON.parse(variablesStr);

      // Facebook post mutations might have friendly names like:
      // - CometStoryCreateMutation
      // - StoryCreateMutation
      // - ComposerStoryCreateMutation
      // - PagePostCreateMutation
      if (friendlyName && (friendlyName.includes("CreateMutation") || friendlyName.includes("StoryCreate") || friendlyName.includes("ComposerStory"))) {
        console.log(`[Chamber] Intercepted Post Mutation: ${friendlyName}`, variables);
        
        // Extract post details depending on Facebook's variable payload format
        const postInput = variables.input || {};
        const textContent = postInput.message?.text || postInput.message?.text_with_entities?.text || "";
        const privacy = postInput.privacy?.base_state || "EVERYONE"; // EVERYONE, FRIENDS, SELF, etc.
        const trackingId = postInput.client_mutation_id || "";
        
        // Extract media attachment urls if present (e.g., photo/video uploads)
        let mediaUrls = [];
        if (postInput.attachments) {
          mediaUrls = postInput.attachments.map(att => {
            // Facebook mutation parameters might have temporary staging IDs or paths
            return att.photo?.id || att.video?.id || "facebook-media-upload";
          });
        }

        // Post back the raw event info to content.js
        window.postMessage({
          source: "chamber-graphql-interceptor",
          type: "FB_NEW_POST_DRAFT",
          data: {
            textContent,
            privacy,
            mediaUrls,
            timestamp: Math.floor(Date.now() / 1000),
            trackingId
          }
        }, "*");
      }
    } catch (e) {
      // Fail silently to avoid interrupting Facebook operations
      console.debug("[Chamber] Failed to parse intercepted request body:", e);
    }
  }

  // Hook window.fetch
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const [resource, config] = args;
    if (typeof resource === "string" && resource.includes("/api/graphql/")) {
      if (config && config.body) {
        inspectGraphQLRequest(config.body);
      }
    }
    return originalFetch.apply(this, args);
  };

  // Hook XMLHttpRequest
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function(body) {
    try {
      if (body && typeof body === "string") {
        inspectGraphQLRequest(body);
      }
    } catch (e) {
      console.debug("[Chamber] Error hooks on XHR send:", e);
    }
    return originalSend.apply(this, arguments);
  };

  // Post user context immediately on load
  try {
    if (window.CurrentUserInitialData) {
      window.postMessage({
        source: "chamber-graphql-interceptor",
        type: "FB_USER_CONTEXT",
        data: {
          userId: window.CurrentUserInitialData.USER_ID || null,
          accountId: window.CurrentUserInitialData.ACCOUNT_ID || null
        }
      }, "*");
    }
  } catch (e) {
    console.debug("[Chamber] User context extraction failed:", e);
  }
})();
