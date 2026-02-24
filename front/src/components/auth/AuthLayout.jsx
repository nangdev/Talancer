import { useSelector } from 'react-redux';

export default function AuthLayout({ children }) {
  const mode = useSelector((state) => state.auth.mode);

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="logo-box">C</div>
        <h1 className="auth-title">{mode === 'login' ? 'Login' : 'Sign up'}</h1>
        {children}
      </div>
    </div>
  );
}
