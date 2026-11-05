const loginForm = document.querySelector('#login-form');
const signupForm = document.querySelector('#signup-form');
const loginMode = document.querySelector('#login-mode');
const signupMode = document.querySelector('#signup-mode');
const title = document.querySelector('#form-title');
const intro = document.querySelector('#form-intro');
const message = document.querySelector('#auth-message');

function showMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle('error', isError);
}

function setMode(mode) {
  const isSignup = mode === 'signup';
  loginForm.hidden = isSignup;
  signupForm.hidden = !isSignup;
  loginMode.classList.toggle('active', !isSignup);
  signupMode.classList.toggle('active', isSignup);
  loginMode.setAttribute('aria-pressed', String(!isSignup));
  signupMode.setAttribute('aria-pressed', String(isSignup));
  title.textContent = isSignup ? 'Create your account' : 'Welcome back';
  intro.textContent = isSignup
    ? 'Sign up to access the library catalog.'
    : 'Sign in to continue to the catalog.';
  showMessage('');
}

async function submitForm(form, endpoint) {
  showMessage('');
  const values = Object.fromEntries(new FormData(form));
  try {
    const response = await fetch(`/api/auth/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Request failed');
    window.location.assign('/index.html');
  } catch (err) {
    showMessage(err.message, true);
  }
}

loginMode.addEventListener('click', () => setMode('login'));
signupMode.addEventListener('click', () => setMode('signup'));
loginForm.addEventListener('submit', (event) => {
  event.preventDefault();
  submitForm(loginForm, 'login');
});
signupForm.addEventListener('submit', (event) => {
  event.preventDefault();
  submitForm(signupForm, 'signup');
});

fetch('/api/auth/me')
  .then((response) => {
    if (response.ok) window.location.replace('/index.html');
    else if (response.status !== 401) showMessage('Unable to verify your session. Please try again.', true);
  })
  .catch(() => showMessage('Unable to verify your session. Please try again.', true));
