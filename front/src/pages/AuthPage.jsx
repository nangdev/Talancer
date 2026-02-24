import { useSelector } from 'react-redux'
import AuthLayout from '../components/auth/AuthLayout'
import LoginForm from '../components/auth/LoginForm'
import SignupForm from '../components/auth/SignupForm'

export default function AuthPage() {
  const mode = useSelector((state) => state.auth.mode)

  return (
    <AuthLayout>
      {mode === 'login' ? <LoginForm /> : <SignupForm />}
    </AuthLayout>
  )
}