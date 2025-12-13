(function () {
  const navHTML = `
    <style>
      .bottom-nav {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background-color: #1A1A1A;
        border-radius: 40px;
        padding: 10px 25px;
        display: flex;
        gap: 25px;
        justify-content: center;
        align-items: center;
        box-shadow: 0 6px 20px rgba(0,0,0,0.25);
        z-index: 10000;
      }
      .bottom-nav .nav-item,
      .bottom-nav .nav-create {
        color: #DCEF62;
        font-size: 1.3rem;
        background: none;
        border: none;
        cursor: pointer;
        transition: 0.3s;
      }
      .bottom-nav .nav-item i {
        color: #DCEF62;
      }
      .bottom-nav .nav-create {
        background-color: #DCEF62;
        color: #1A1A1A;
        border-radius: 50%;
        width: 48px;
        height: 48px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .bottom-nav .nav-create i {
        color: #1A1A1A;
      }
      .bottom-nav .nav-item:hover,
      .bottom-nav .nav-create:hover {
        transform: translateY(-2px);
      }

      #floatingCreateMenu {
        position: fixed;
        bottom: 80px;
        right: 20px;
        display: none;
        flex-direction: column;
        gap: 10px;
        background: #222;
        border-radius: 8px;
        padding: 10px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.5);
        z-index: 10001;
      }
      #floatingCreateMenu button {
        background: #DCEF62;
        border: none;
        padding: 8px 12px;
        border-radius: 6px;
        cursor: pointer;
        font-weight: bold;
        color: #1A1A1A;
      }

      #createBoardModal {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.6);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 10002;
      }
      #createBoardModal .modal-content {
        background: #fff;
        padding: 20px 30px;
        border-radius: 10px;
        max-width: 400px;
        width: 90%;
        box-shadow: 0 2px 15px rgba(0,0,0,0.3);
        color: #111;
      }
    </style>

    <nav class="bottom-nav" id="floatingBottomNav">
      <a href="chat.html" class="nav-item"><i class="fa-solid fa-comments"></i></a>
      <a href="collaborations.html" class="nav-item"><i class="fa-solid fa-users"></i></a>

      <button class="nav-create" id="createBtn"><i class="fa-solid fa-plus"></i></button>

      <a href="livevideo.html" class="nav-item"><i class="fa-solid fa-video"></i></a>
      <a href="pair-programming.html" class="nav-item"><i class="fa-solid fa-pen-to-square"></i></a>
    </nav>

    <div id="floatingCreateMenu">
      <button id="btnCreatePairProgramming">Create Pair-Programming Project</button>
      <button id="btnCreateBoard">Create Board</button>
    </div>

    <div id="createPairModal" style="display:none; position: fixed; top:0; left:0; right:0; bottom:0; background: rgba(0,0,0,0.6);
      align-items:center; justify-content:center; z-index:10002;">
      <div style="background:#fff; padding:20px 30px; border-radius:10px; max-width:400px; width:90%; box-shadow: 0 2px 15px rgba(0,0,0,0.3); color:#111; position: relative;">
        <button id="closePairModal" style="position:absolute; top:10px; right:10px; font-size:18px; background:none; border:none; cursor:pointer;">✕</button>
        <h2>Create New Pair-Programming Project</h2>
        <label for="pairProjectTitleInput">Project Name *</label>
        <input type="text" id="pairProjectTitleInput" required />
        <button id="submitCreatePairProject" disabled>Create</button>
        <div id="pairCreateError" style="color:red; margin-top:8px; display:none;"></div>
      </div>
    </div>

    <div id="createBoardModal">
      <div class="modal-content">
        <h2>Create New Board</h2>
        <label for="boardTitleInput">Title *</label>
        <input type="text" id="boardTitleInput" required />
        <button id="submitCreateBoard" disabled>Create</button>
      </div>
    </div>
  `;

  document.addEventListener("DOMContentLoaded", () => {
    document.body.insertAdjacentHTML("beforeend", navHTML);

    const createBtn = document.getElementById("createBtn");
    const createMenu = document.getElementById("floatingCreateMenu");
    const btnCreateBoard = document.getElementById("btnCreateBoard");
    const modal = document.getElementById("createBoardModal");
    const boardTitleInput = document.getElementById("boardTitleInput");
    const submitBtn = document.getElementById("submitCreateBoard");

    const btnCreatePairProgramming = document.getElementById("btnCreatePairProgramming");
    const pairModal = document.getElementById("createPairModal");
    const pairTitleInput = document.getElementById("pairProjectTitleInput");
    const submitPairBtn = document.getElementById("submitCreatePairProject");

    // CREATE MENU TOGGLE
    createBtn.addEventListener("click", () => {
      createMenu.style.display =
        createMenu.style.display === "flex" ? "none" : "flex";
    });

    // CREATE BOARD
    btnCreateBoard.addEventListener("click", () => {
      createMenu.style.display = "none";
      modal.style.display = "flex";
      boardTitleInput.focus();
    });

    boardTitleInput.addEventListener("input", () => {
      submitBtn.disabled = !boardTitleInput.value.trim();
    });

    submitBtn.addEventListener("click", async () => {
      const title = boardTitleInput.value.trim();
      submitBtn.disabled = true;
      submitBtn.textContent = "Creating...";

      try {
        const token = localStorage.getItem("token");
        const res = await fetch("http://127.0.0.1:5000/api/board/create", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ name: title }),
        });

        const data = await res.json();
        submitBtn.disabled = false;
        submitBtn.textContent = "Create";

        if (data.success) {
          modal.style.display = "none";
          window.location.href = `board.html?id=${data.data._id}`;
        }
      } catch (e) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Create";
      }
    });

    // CREATE PAIR PROGRAMMING
    document.getElementById("closePairModal").addEventListener("click", () => {
      pairModal.style.display = "none";
    });

    btnCreatePairProgramming.addEventListener("click", () => {
      createMenu.style.display = "none";
      pairModal.style.display = "flex";
      pairTitleInput.value = "";
      submitPairBtn.disabled = true;
    });

    pairTitleInput.addEventListener("input", () => {
      submitPairBtn.disabled = !pairTitleInput.value.trim();
    });

    submitPairBtn.addEventListener("click", async () => {
      const title = pairTitleInput.value.trim();
      if (!title) return;

      submitPairBtn.disabled = true;
      submitPairBtn.textContent = "Creating...";

      try {
        const token = localStorage.getItem("token");
        const res = await fetch("http://127.0.0.1:5000/api/pair-programming/create", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ name: title }),
        });

        const data = await res.json();
        submitPairBtn.disabled = false;
        submitPairBtn.textContent = "Create";

        if (data.success) {
          pairModal.style.display = "none";
          window.location.href = `pair-programming.html?id=${data.data._id}`;
        }
      } catch (err) {
        submitPairBtn.disabled = false;
        submitPairBtn.textContent = "Create";
        alert("Error: " + err.message);
      }
    });
  });
})();
