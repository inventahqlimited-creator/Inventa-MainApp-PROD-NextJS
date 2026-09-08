import { Metadata } from 'next'
import LoginForm from './login-form'

export const metadata: Metadata = { title: 'Sign in' }

export const dynamic = 'force-dynamic'

export default function LoginPage() {
  return <LoginForm />
}
