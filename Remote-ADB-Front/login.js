const loginForm = document.getElementById('loginForm');
const passwordInput = document.getElementById('passwordInput');
const loginError = document.getElementById('loginError');

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginError.textContent = '';

  const secret = passwordInput.value.trim();
  if (!secret) {
    loginError.textContent = 'Please enter the access secret.';
    return;
  }

  try {
    const response = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret }),
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || 'Login failed.');
    }

    window.location.href = '/';
  } catch (error) {
    loginError.textContent = error.message;
  }
});
