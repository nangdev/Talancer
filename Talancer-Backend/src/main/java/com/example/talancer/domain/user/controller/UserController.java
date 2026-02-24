package com.example.talancer.domain.user.controller;

import com.example.talancer.common.RspTemplate;
import com.example.talancer.domain.user.dto.LoginReqDto;
import com.example.talancer.domain.user.dto.SignupReqDto;
import com.example.talancer.domain.user.dto.TokenRspDto;
import com.example.talancer.domain.user.dto.UserMeRspDto;
import com.example.talancer.domain.user.service.UserService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/users")
@RequiredArgsConstructor
@Tag(name = "유저 관리")
public class UserController {
    private final UserService userService;

    @Operation(summary = "회원가입")
    @PostMapping("/sign-up")
    public RspTemplate<String> signup(@RequestBody SignupReqDto dto) {
        userService.signUp(dto);
        return new RspTemplate<>(HttpStatus.OK, "회원가입이 완료되었습니다.");
    }

    @Operation(summary = "로그인")
    @PostMapping("/login")
    public RspTemplate<TokenRspDto> login(@RequestBody LoginReqDto dto) {
        String token = userService.login(dto.getLoginId(), dto.getPassword());
        return new RspTemplate<>(HttpStatus.OK, "로그인 완료", new TokenRspDto(token));
    }

    @Operation(summary = "내 정보 조회")
    @GetMapping("/me")
    public RspTemplate<UserMeRspDto> me() {
        return new RspTemplate<>(HttpStatus.OK, "내 정보 조회 완료", userService.getCurrentUserProfile());
    }
}
