import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { login, setMode } from '../../features/auth/authSlice';
import AuthInput from './AuthInput';
import Button from '../common/Button';

export default function LoginForm() {
  const dispatch = useDispatch();
  const { loading, error } = useSelector((state) => state.auth);

  const [form, setForm] = useState({
    loginId: '',
    password: '',
  });
  const [localError, setLocalError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');

    if (!form.loginId.trim() || !form.password.trim()) {
      setLocalError('Please enter login id and password.');
      return;
    }

    await dispatch(login(form));
  };

  return (
    <form onSubmit={handleSubmit} className="auth-form">
      <AuthInput
        name="loginId"
        value={form.loginId}
        onChange={handleChange}
        placeholder="Login ID"
      />

      <AuthInput
        type="password"
        name="password"
        value={form.password}
        onChange={handleChange}
        placeholder="Password"
      />

      {(localError || error) && <p className="error-text">{localError || error}</p>}

      <Button type="submit" disabled={loading}>
        {loading ? 'Logging in...' : 'Login'}
      </Button>

      <p className="auth-link-text">
        No account?{' '}
        <button type="button" className="text-link" onClick={() => dispatch(setMode('signup'))}>
          Sign up
        </button>
      </p>
    </form>
  );
}
