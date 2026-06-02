// script.js
import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, updateProfile, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, addDoc, getDocs, getDoc, doc, updateDoc, increment,
  query, orderBy, onSnapshot, where, setDoc, serverTimestamp, arrayUnion, arrayRemove
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ─── STATE ───────────────────────────────────────────────────────────────────
let currentUser = null;
let currentPage = "home";

// ─── ROUTER ──────────────────────────────────────────────────────────────────
function showPage(page, data = {}) {
  currentPage = page;
  document.querySelectorAll(".page").forEach(p => p.classList.add("hidden"));
  const el = document.getElementById(`page-${page}`);
  if (el) el.classList.remove("hidden");
  window.scrollTo(0, 0);
  if (page === "home") loadFeaturedPosts();
  if (page === "feed") loadAllPosts();
  if (page === "profile") loadProfile(data.uid || currentUser?.uid);
  if (page === "messages") loadMessages();
  if (page === "post") loadPost(data.id);
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async user => {
  currentUser = user;
  updateNav();
  if (user) {
    await setDoc(doc(db, "users", user.uid), {
      displayName: user.displayName || "Anonymous",
      email: user.email,
      uid: user.uid
    }, { merge: true });
  }
});

function updateNav() {
  const authLinks = document.getElementById("nav-auth");
  const userLinks = document.getElementById("nav-user");
  if (currentUser) {
    authLinks.classList.add("hidden");
    userLinks.classList.remove("hidden");
    document.getElementById("nav-username").textContent = currentUser.displayName || "Profile";
  } else {
    authLinks.classList.remove("hidden");
    userLinks.classList.add("hidden");
  }
}

window.handleSignup = async () => {
  const name = document.getElementById("signup-name").value.trim();
  const email = document.getElementById("signup-email").value.trim();
  const pass = document.getElementById("signup-pass").value;
  const err = document.getElementById("signup-error");
  err.textContent = "";
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(cred.user, { displayName: name });
    await setDoc(doc(db, "users", cred.user.uid), { displayName: name, email, uid: cred.user.uid });
    showPage("home");
  } catch (e) { err.textContent = e.message; }
};

window.handleLogin = async () => {
  const email = document.getElementById("login-email").value.trim();
  const pass = document.getElementById("login-pass").value;
  const err = document.getElementById("login-error");
  err.textContent = "";
  try {
    await signInWithEmailAndPassword(auth, email, pass);
    showPage("home");
  } catch (e) { err.textContent = e.message; }
};

window.handleLogout = async () => {
  await signOut(auth);
  showPage("home");
};

window.handleForgotPassword = async () => {
  const email = document.getElementById("login-email").value.trim();
  if (!email) { document.getElementById("login-error").textContent = "Enter your email first."; return; }
  try {
    await sendPasswordResetEmail(auth, email);
    document.getElementById("login-error").textContent = "Reset email sent!";
    document.getElementById("login-error").classList.add("text-emerald-400");
  } catch (e) { document.getElementById("login-error").textContent = e.message; }
};

// ─── POSTS ────────────────────────────────────────────────────────────────────
window.handleCreatePost = async () => {
  if (!currentUser) { showPage("login"); return; }
  const title = document.getElementById("post-title").value.trim();
  const content = document.getElementById("post-content").value.trim();
  const tag = document.getElementById("post-tag").value;
  const err = document.getElementById("post-error");
  if (!title || !content) { err.textContent = "Title and content required."; return; }
  err.textContent = "";
  try {
    await addDoc(collection(db, "posts"), {
      title, content, tag,
      authorId: currentUser.uid,
      authorName: currentUser.displayName || "Anonymous",
      createdAt: serverTimestamp(),
      views: 0, likes: [], commentCount: 0
    });
    await updateDoc(doc(db, "users", currentUser.uid), { postCount: increment(1) }).catch(() =>
      setDoc(doc(db, "users", currentUser.uid), { postCount: 1 }, { merge: true })
    );
    document.getElementById("post-title").value = "";
    document.getElementById("post-content").value = "";
    showPage("feed");
  } catch (e) { err.textContent = e.message; }
};

async function loadFeaturedPosts() {
  const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  const container = document.getElementById("featured-posts");
  const posts = [];
  snap.forEach(d => posts.push({ id: d.id, ...d.data() }));
  const featured = posts.slice(0, 3);
  container.innerHTML = featured.length
    ? featured.map(p => postCard(p)).join("")
    : `<p class="text-slate-400 col-span-3 text-center">No posts yet. Be the first to share!</p>`;
}

async function loadAllPosts() {
  const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
  onSnapshot(q, snap => {
    const container = document.getElementById("all-posts");
    const posts = [];
    snap.forEach(d => posts.push({ id: d.id, ...d.data() }));
    container.innerHTML = posts.length
      ? posts.map(p => postCard(p)).join("")
      : `<p class="text-slate-400 col-span-3 text-center">No posts yet.</p>`;
  });
}

function postCard(p) {
  const date = p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString() : "Recently";
  const likes = p.likes?.length || 0;
  const tagColor = { FIRE: "emerald", Investing: "blue", Frugality: "purple", Story: "amber", Other: "slate" }[p.tag] || "slate";
  return `
  <div class="glass-card rounded-2xl p-6 cursor-pointer hover:scale-[1.02] transition-all duration-300 flex flex-col gap-3"
    onclick="openPost('${p.id}')">
    <span class="text-xs font-bold px-3 py-1 rounded-full bg-${tagColor}-500/20 text-${tagColor}-300 w-fit">${p.tag || "FIRE"}</span>
    <h3 class="text-lg font-bold text-white leading-tight">${escHtml(p.title)}</h3>
    <p class="text-slate-400 text-sm line-clamp-3">${escHtml(p.content)}</p>
    <div class="flex items-center justify-between text-xs text-slate-500 mt-auto pt-2 border-t border-white/10">
      <span class="flex items-center gap-1">
        <span class="w-6 h-6 rounded-full bg-emerald-500/30 flex items-center justify-center text-emerald-300 font-bold text-xs">${(p.authorName||"A")[0].toUpperCase()}</span>
        ${escHtml(p.authorName)}
      </span>
      <span class="flex items-center gap-3">
        <span>👁 ${p.views || 0}</span>
        <span>❤️ ${likes}</span>
        <span>💬 ${p.commentCount || 0}</span>
        <span>${date}</span>
      </span>
    </div>
  </div>`;
}

window.openPost = async (id) => {
  await updateDoc(doc(db, "posts", id), { views: increment(1) }).catch(() => {});
  showPage("post", { id });
};

async function loadPost(id) {
  const snap = await getDoc(doc(db, "posts", id));
  if (!snap.exists()) { document.getElementById("post-detail").innerHTML = "<p class='text-red-400'>Post not found.</p>"; return; }
  const p = { id: snap.id, ...snap.data() };
  const date = p.createdAt?.toDate ? p.createdAt.toDate().toLocaleDateString() : "Recently";
  const liked = currentUser && p.likes?.includes(currentUser.uid);
  document.getElementById("post-detail").innerHTML = `
    <button onclick="showPage('feed')" class="mb-6 text-emerald-400 hover:underline text-sm">← Back to Feed</button>
    <div class="glass-card rounded-2xl p-8">
      <div class="flex items-center gap-3 mb-4">
        <span class="w-10 h-10 rounded-full bg-emerald-500/30 flex items-center justify-center text-emerald-300 font-bold text-lg">${(p.authorName||"A")[0].toUpperCase()}</span>
        <div>
          <p class="font-semibold text-white">${escHtml(p.authorName)}</p>
          <p class="text-slate-400 text-xs">${date}</p>
        </div>
        ${currentUser && currentUser.uid !== p.authorId ? `<button onclick="openDM('${p.authorId}','${escHtml(p.authorName)}')" class="ml-auto btn-secondary text-xs px-3 py-1">✉️ Message</button>` : ""}
      </div>
      <h1 class="text-3xl font-bold text-white mb-6">${escHtml(p.title)}</h1>
      <div class="text-slate-300 leading-relaxed whitespace-pre-wrap mb-8">${escHtml(p.content)}</div>
      <div class="flex items-center gap-6 text-sm text-slate-400 border-t border-white/10 pt-4">
        <span>👁 ${p.views || 0} views</span>
        <button onclick="toggleLike('${id}')" class="flex items-center gap-1 ${liked ? "text-pink-400" : "hover:text-pink-400"} transition-colors">
          ${liked ? "❤️" : "🤍"} <span id="like-count-${id}">${p.likes?.length || 0}</span> likes
        </button>
        <span>💬 ${p.commentCount || 0} comments</span>
      </div>
    </div>
    <div class="mt-8">
      <h2 class="text-xl font-bold text-white mb-4">Comments</h2>
      ${currentUser ? `
        <div class="glass-card rounded-xl p-4 mb-6 flex gap-3">
          <input id="comment-input" placeholder="Share your thoughts..." class="input-field flex-1 text-sm" />
          <button onclick="postComment('${id}')" class="btn-primary px-4 text-sm">Post</button>
        </div>` : `<p class="text-slate-400 text-sm mb-4"><button onclick="showPage('login')" class="text-emerald-400 underline">Log in</button> to comment.</p>`}
      <div id="comments-list"></div>
    </div>`;
  loadComments(id);
}

window.toggleLike = async (postId) => {
  if (!currentUser) { showPage("login"); return; }
  const ref = doc(db, "posts", postId);
  const snap = await getDoc(ref);
  const likes = snap.data().likes || [];
  if (likes.includes(currentUser.uid)) {
    await updateDoc(ref, { likes: arrayRemove(currentUser.uid) });
  } else {
    await updateDoc(ref, { likes: arrayUnion(currentUser.uid) });
  }
  loadPost(postId);
};

// ─── COMMENTS ────────────────────────────────────────────────────────────────
window.postComment = async (postId) => {
  if (!currentUser) return;
  const input = document.getElementById("comment-input");
  const text = input.value.trim();
  if (!text) return;
  await addDoc(collection(db, "posts", postId, "comments"), {
    text, authorName: currentUser.displayName || "Anonymous",
    authorId: currentUser.uid, createdAt: serverTimestamp()
  });
  await updateDoc(doc(db, "posts", postId), { commentCount: increment(1) });
  input.value = "";
};

function loadComments(postId) {
  const q = query(collection(db, "posts", postId, "comments"), orderBy("createdAt", "asc"));
  onSnapshot(q, snap => {
    const el = document.getElementById("comments-list");
    if (!el) return;
    const comments = [];
    snap.forEach(d => comments.push({ id: d.id, ...d.data() }));
    el.innerHTML = comments.length
      ? comments.map(c => {
          const date = c.createdAt?.toDate ? c.createdAt.toDate().toLocaleDateString() : "";
          return `<div class="glass-card rounded-xl p-4 mb-3 flex gap-3">
            <span class="w-8 h-8 rounded-full bg-blue-500/30 flex items-center justify-center text-blue-300 font-bold text-xs shrink-0">${(c.authorName||"A")[0].toUpperCase()}</span>
            <div><p class="text-sm font-semibold text-white">${escHtml(c.authorName)} <span class="text-slate-500 font-normal text-xs ml-2">${date}</span></p>
            <p class="text-slate-300 text-sm mt-1">${escHtml(c.text)}</p></div>
          </div>`;
        }).join("")
      : `<p class="text-slate-400 text-sm">No comments yet. Start the conversation!</p>`;
  });
}

// ─── PROFILE ─────────────────────────────────────────────────────────────────
async function loadProfile(uid) {
  if (!uid) { showPage("login"); return; }
  const userSnap = await getDoc(doc(db, "users", uid));
  const userData = userSnap.exists() ? userSnap.data() : { displayName: "Unknown", postCount: 0 };
  const q = query(collection(db, "posts"), where("authorId", "==", uid), orderBy("createdAt", "desc"));
  const postsSnap = await getDocs(q);
  const posts = [];
  postsSnap.forEach(d => posts.push({ id: d.id, ...d.data() }));
  document.getElementById("profile-content").innerHTML = `
    <div class="glass-card rounded-2xl p-8 mb-8 flex flex-col sm:flex-row items-center gap-6">
      <div class="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500 to-blue-600 flex items-center justify-center text-4xl font-bold text-white">
        ${(userData.displayName||"A")[0].toUpperCase()}
      </div>
      <div>
        <h2 class="text-2xl font-bold text-white">${escHtml(userData.displayName)}</h2>
        <p class="text-slate-400 text-sm mt-1">🔥 FIRE Community Member</p>
        <p class="text-emerald-400 font-semibold mt-2">📝 ${posts.length} Posts Published</p>
      </div>
    </div>
    <h3 class="text-xl font-bold text-white mb-4">Posts by ${escHtml(userData.displayName)}</h3>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      ${posts.length ? posts.map(p => postCard(p)).join("") : `<p class="text-slate-400">No posts yet.</p>`}
    </div>`;
}

// ─── MESSAGES ────────────────────────────────────────────────────────────────
window.openDM = (toId, toName) => {
  if (!currentUser) { showPage("login"); return; }
  showPage("messages");
  setTimeout(() => {
    document.getElementById("dm-to-name").textContent = `To: ${toName}`;
    document.getElementById("dm-recipient-id").value = toId;
    document.getElementById("dm-compose").classList.remove("hidden");
    loadConversation(toId);
  }, 100);
};

async function loadMessages() {
  if (!currentUser) { showPage("login"); return; }
  const q = query(collection(db, "messages"), where("participants", "array-contains", currentUser.uid), orderBy("createdAt", "desc"));
  onSnapshot(q, snap => {
    const container = document.getElementById("inbox-list");
    const seen = new Set();
    const items = [];
    snap.forEach(d => {
      const data = d.data();
      const otherId = data.participants.find(id => id !== currentUser.uid);
      if (!seen.has(otherId)) { seen.add(otherId); items.push({ id: d.id, ...data, otherId }); }
    });
    container.innerHTML = items.length
      ? items.map(m => `
          <div class="glass-card rounded-xl p-4 cursor-pointer hover:border-emerald-500/50 border border-transparent transition-all"
            onclick="openDM('${m.otherId}','${escHtml(m.toName || m.fromName || "User")}')">
            <div class="flex items-center gap-3">
              <span class="w-10 h-10 rounded-full bg-blue-500/30 flex items-center justify-center text-blue-300 font-bold">${(m.toName||m.fromName||"U")[0].toUpperCase()}</span>
              <div><p class="font-semibold text-white">${escHtml(m.toName || m.fromName || "User")}</p>
              <p class="text-slate-400 text-xs line-clamp-1">${escHtml(m.text)}</p></div>
            </div>
          </div>`).join("")
      : `<p class="text-slate-400 text-sm">No messages yet. Message a blog author to start!</p>`;
  });
}

function loadConversation(otherId) {
  const threadId = [currentUser.uid, otherId].sort().join("_");
  const q = query(collection(db, "threads", threadId, "messages"), orderBy("createdAt", "asc"));
  onSnapshot(q, snap => {
    const el = document.getElementById("conversation");
    if (!el) return;
    const msgs = [];
    snap.forEach(d => msgs.push({ id: d.id, ...d.data() }));
    el.innerHTML = msgs.map(m => {
      const mine = m.senderId === currentUser.uid;
      return `<div class="flex ${mine ? "justify-end" : "justify-start"} mb-2">
        <div class="max-w-xs px-4 py-2 rounded-2xl text-sm ${mine ? "bg-emerald-600 text-white" : "bg-white/10 text-slate-200"}">
          ${escHtml(m.text)}
        </div>
      </div>`;
    }).join("");
    el.scrollTop = el.scrollHeight;
  });
}

window.sendDM = async () => {
  if (!currentUser) return;
  const toId = document.getElementById("dm-recipient-id").value;
  const text = document.getElementById("dm-text").value.trim();
  if (!text || !toId) return;
  const threadId = [currentUser.uid, toId].sort().join("_");
  const toSnap = await getDoc(doc(db, "users", toId)).catch(() => null);
  const toName = toSnap?.data()?.displayName || "User";
  await addDoc(collection(db, "threads", threadId, "messages"), {
    text, senderId: currentUser.uid, senderName: currentUser.displayName,
    toId, toName, createdAt: serverTimestamp()
  });
  await setDoc(doc(db, "messages", threadId), {
    participants: [currentUser.uid, toId],
    fromName: currentUser.displayName, toName,
    text, createdAt: serverTimestamp()
  });
  document.getElementById("dm-text").value = "";
};

// ─── UTILITIES ───────────────────────────────────────────────────────────────
function escHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ─── EXPOSE showPage globally ─────────────────────────────────────────────────
window.showPage = showPage;
window.loadConversation = loadConversation;
