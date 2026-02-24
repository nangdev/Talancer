import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setMode, signup } from '../../features/auth/authSlice';
import AuthInput from './AuthInput';
import Button from '../common/Button';

export default function SignupForm() {
  const dispatch = useDispatch();
  const { signupLoading, error, signupMessage } = useSelector((state) => state.auth);

  const [form, setForm] = useState({
    loginId: '',
    password: '',
    passwordConfirm: '',
    name: '',
  });
  const [localError, setLocalError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');

    const { loginId, password, passwordConfirm, name } = form;

    if (!loginId.trim() || !password.trim() || !passwordConfirm.trim() || !name.trim()) {
      setLocalError('Please fill in all fields.');
      return;
    }

    if (password !== passwordConfirm) {
      setLocalError('Password confirmation does not match.');
      return;
    }

    const resultAction = await dispatch(signup({ loginId, password, name }));
    if (signup.fulfilled.match(resultAction)) {
      setForm({
        loginId: '',
        password: '',
        passwordConfirm: '',
        name: '',
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="auth-form">
      <AuthInput name="loginId" value={form.loginId} onChange={handleChange} placeholder="Login ID" />

      <AuthInput
        type="password"
        name="password"
        value={form.password}
        onChange={handleChange}
        placeholder="Password"
      />

      <AuthInput
        type="password"
        name="passwordConfirm"
        value={form.passwordConfirm}
        onChange={handleChange}
        placeholder="Confirm password"
      />

      <AuthInput name="name" value={form.name} onChange={handleChange} placeholder="Name" />

      {(localError || error) && <p className="error-text">{localError || error}</p>}
      {signupMessage && <p className="success-text">{signupMessage}</p>}

      <Button type="submit" disabled={signupLoading}>
        {signupLoading ? 'Signing up...' : 'Sign up'}
      </Button>

      <p className="auth-link-text">
        Already have an account?{' '}
        <button type="button" className="text-link" onClick={() => dispatch(setMode('login'))}>
          Login
        </button>
      </p>
    </form>
  );
}
