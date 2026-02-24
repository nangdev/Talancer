package com.example.talancer.domain.user.service;

import com.example.talancer.common.util.SecurityUtil;
import com.example.talancer.common.auth.JwtProvider;
import com.example.talancer.common.exception.BusinessException;
import com.example.talancer.common.exception.ErrorCode;
import com.example.talancer.domain.user.dto.SignupReqDto;
import com.example.talancer.domain.user.dto.UserMeRspDto;
import com.example.talancer.domain.user.entity.User;
import com.example.talancer.domain.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class UserService {
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtProvider jwtProvider;

    // 회원가입
    @Transactional
    public User signUp(SignupReqDto dto) {
        if(userRepository.findByLoginId(dto.getLoginId()).isPresent())
            throw new BusinessException(ErrorCode.ALREADY_USER);

        User user = User.builder()
                .loginId(dto.getLoginId())
                .name(dto.getName())
                .password(passwordEncoder.encode(dto.getPassword()))
                .build();

        return userRepository.save(user);
    }

    // 로그인
    @Transactional(readOnly = true)
    public String login(String loginId, String rawPassword) {
        User user = userRepository.findByLoginId(loginId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND_USER));

        if(!passwordEncoder.matches(rawPassword, user.getPassword())) {
            throw new BusinessException(ErrorCode.INCORRECT_PASSWORD);
        }

        return jwtProvider.generateToken(user.getLoginId(), user.getRole());
    }

    @Transactional(readOnly = true)
    public UserMeRspDto getCurrentUserProfile() {
        String loginId = SecurityUtil.getCurrentLoginId();
        User user = userRepository.findByLoginId(loginId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND_USER));

        return new UserMeRspDto(
                user.getUserId(),
                user.getLoginId(),
                user.getName(),
                user.getRole() == null ? null : user.getRole().name()
        );
    }
}
