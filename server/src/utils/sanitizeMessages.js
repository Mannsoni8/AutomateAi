export const sanitizeMessages = (messages = []) => {
  if (!Array.isArray(messages)) return [];

  return messages
    .map((msg) => {
      if (!msg) return null;

      // If content is an array (e.g. multimodal [{type: 'text'}, {type: 'image_url'}]),
      // Groq requires content to be a string. Flatten it into a string.
      if (Array.isArray(msg.content)) {
        const textParts = [];
        let imageUrl = null;

        for (const item of msg.content) {
          if (!item) continue;
          if (typeof item === "string" && item.trim()) {
            textParts.push(item.trim());
          } else if (
            item.type === "text" &&
            typeof item.text === "string" &&
            item.text.trim()
          ) {
            textParts.push(item.text.trim());
          } else if (item.type === "image_url") {
            const url =
              typeof item.image_url === "string"
                ? item.image_url
                : item.image_url?.url;
            if (url) imageUrl = url;
          }
        }

        let combinedText = textParts.join("\n").trim();
        if (imageUrl) {
          combinedText = combinedText
            ? `${combinedText}\n\nImage URL: ${imageUrl}`
            : `Image URL: ${imageUrl}`;
        }

        if (!combinedText) return null;
        msg.content = combinedText;
        return msg;
      }

      // If content is an object, extract string
      if (msg.content && typeof msg.content === "object") {
        const extracted = (
          msg.content.text ||
          msg.content.message ||
          ""
        ).trim();
        if (extracted.length > 0) {
          msg.content = extracted;
          return msg;
        }
        return null;
      }

      // If content is a string
      if (typeof msg.content === "string") {
        const trimmed = msg.content.trim();
        if (trimmed.length > 0) {
          msg.content = trimmed;
          return msg;
        }
        // AI tool call message can have empty content if tool_calls exist
        if (
          msg.tool_calls &&
          Array.isArray(msg.tool_calls) &&
          msg.tool_calls.length > 0
        ) {
          return msg;
        }
        return null;
      }

      return null;
    })
    .filter(Boolean);
};
