
// ==========================================
// COMMENT EDIT/DELETE FUNCTIONS (Appended)
// ==========================================

async function enableCommentEdit(comment, itemNode) {
    const body = itemNode.querySelector(".comment-body");
    const originalText = comment.text;

    // Check time limit client-side as well
    const diff = Date.now() - new Date(comment.createdAt).getTime();
    if (diff > 5 * 60 * 1000) return showToast("Time limit exceeded", "error");

    body.innerHTML = "";
    const input = el("input", { type: "text", class: "comment-edit-input", value: originalText });
    const saveBtn = el("button", { class: "btn-primary btn-sm" }, ["Save"]);
    const cancelBtn = el("button", { class: "btn-secondary btn-sm" }, ["Cancel"]);

    const wrapper = el("div", { class: "edit-wrapper" }, [input, saveBtn, cancelBtn]);
    body.appendChild(wrapper);

    cancelBtn.onclick = () => {
        body.innerHTML = "";
        body.appendChild(el("div", { class: "comment-author" }, [safeText(comment.userId?.name)]));
        body.appendChild(el("div", { class: "comment-text" }, [safeText(originalText)]));
    };

    saveBtn.onclick = async () => {
        const newText = input.value.trim();
        if (!newText || newText === originalText) return cancelBtn.click();

        try {
            const res = await fetch(`${POSTING_BASE}/comments/${comment._id}`, {
                method: "PUT",
                headers: { ...authHeader, "Content-Type": "application/json" },
                body: JSON.stringify({ text: newText }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.message || "Edit failed");

            comment.text = newText; // update local object
            body.innerHTML = "";
            body.appendChild(el("div", { class: "comment-author" }, [safeText(comment.userId?.name)]));
            body.appendChild(el("div", { class: "comment-text" }, [safeText(newText)]));
            showToast("Comment updated", "success");
        } catch (err) {
            showToast(err.message, "error");
        }
    };
}

async function deleteComment(commentId) {
    if (!await customConfirm("Delete this comment?")) return;

    try {
        const res = await fetch(`${POSTING_BASE}/comments/${commentId}`, {
            method: "DELETE",
            headers: authHeader,
        });
        if (!res.ok) throw new Error("Delete failed");

        // Remove from DOM locally
        const item = document.querySelector(`.comment-item[data-comment-id="${commentId}"]`);
        if (item) {
            // decrement count
            const postNode = item.closest(".feed-post");
            if (postNode) {
                const countSpan = postNode.querySelector(".comment-count span");
                if (countSpan) countSpan.textContent = String(Math.max(0, parseInt(countSpan.textContent || 0) - 1));
            }
            item.remove();
        }

        showToast("Comment deleted", "success");
    } catch (err) {
        showToast("Failed to delete comment", "error");
    }
}

// INJECT STYLES FOR BUTTONS
const style = document.createElement("style");
style.innerHTML = `
.comment-actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
  align-items: center;
}
.comment-action-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.9rem;
  color: #666;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s;
}
.comment-action-btn:hover {
  background: #f0f0f0;
  color: #333;
}
.comment-action-btn.delete:hover {
  color: #e74c3c;
  background: #ffe6e6;
}
.comment-edit-input {
  width: 100%;
  padding: 6px;
  border: 1px solid #ddd;
  border-radius: 4px;
  margin-bottom: 6px;
}
.edit-wrapper {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.btn-sm {
  padding: 4px 10px;
  font-size: 0.8rem;
}
`;
document.head.appendChild(style);
