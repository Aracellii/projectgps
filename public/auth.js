// Auth page script
async function loadScript(src){
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

let sbClient = null;
const params = new URLSearchParams(window.location.search);
const redirectParam = params.get('redirect') || 'index.html';
const redirectTarget = redirectParam.startsWith('http') ? 'index.html' : redirectParam;

function goToApp(){
  window.location.href = redirectTarget;
}

async function getSupabase(){
  const url = window.SUPABASE_URL;
  const key = window.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (sbClient) return sbClient;
  if (!window.supabase) {
    await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js');
  }
  sbClient = window.supabase.createClient(url, key);
  return sbClient;
}

// Switch forms
document.getElementById('switchToRegister').addEventListener('click', () => {
  document.getElementById('loginForm').style.display = 'none';
  document.getElementById('registerForm').style.display = 'block';
});

document.getElementById('switchToLogin').addEventListener('click', () => {
  document.getElementById('registerForm').style.display = 'none';
  document.getElementById('loginForm').style.display = 'block';
});

// Login
document.getElementById('loginBtn').addEventListener('click', async () => {
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const resultEl = document.getElementById('loginResult');
  resultEl.textContent = 'Logging in...';
  try {
    const sb = await getSupabase();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    resultEl.textContent = 'Login berhasil, mengalihkan...';
    goToApp();
  } catch (e) {
    resultEl.textContent = 'Login gagal: ' + e.message;
  }
});

// Register
document.getElementById('registerBtn').addEventListener('click', async () => {
  const email = document.getElementById('registerEmail').value;
  const password = document.getElementById('registerPassword').value;
  const name = document.getElementById('registerName').value;
  const resultEl = document.getElementById('registerResult');
  resultEl.textContent = 'Registering...';
  try {
    const sb = await getSupabase();
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: {
        data: { name },
        emailRedirectTo: `${window.location.origin}/auth.html?redirect=${encodeURIComponent(redirectTarget)}`
      }
    });
    if (error) throw error;
    if (name && data?.user) {
      await sb.from('profiles').upsert({ user_id: data.user.id, name }, { onConflict: 'user_id' });
    }
    if (data?.session) {
      resultEl.textContent = 'Register berhasil! Mengalihkan...';
      goToApp();
    } else {
      resultEl.textContent = 'Register berhasil! Cek email untuk konfirmasi sebelum login.';
    }
  } catch (e) {
    resultEl.textContent = 'Register gagal: ' + e.message;
  }
});

(async () => {
  const sb = await getSupabase();
  if (sb) {
    const { data: { user } } = await sb.auth.getUser();
    if (user) {
      goToApp();
    }
  }
})();