import { useState } from 'react'

export default function AuthInput({
  label,
  type = 'text',
  name,
  value,
  onChange,
  placeholder,
}) {
  const [showPassword, setShowPassword] = useState(false)
  const isPassword = type === 'password'

  const inputType = isPassword && showPassword ? 'text' : type

  return (
    <div className="input-group">
      {label && <label className="input-label">{label}</label>}
      <div className="input-wrap">
        <input
          className="auth-input"
          type={inputType}
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
        />
        {isPassword && (
          <button
            type="button"
            className="eye-btn"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label="비밀번호 보기"
          >
            {showPassword ? '숨김' : '보기'}
          </button>
        )}
      </div>
    </div>
  )
}