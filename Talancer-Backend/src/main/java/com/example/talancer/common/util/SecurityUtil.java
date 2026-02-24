package com.example.talancer.common.util;

import com.example.talancer.common.exception.BusinessException;
import com.example.talancer.common.exception.ErrorCode;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

public class SecurityUtil {
    private SecurityUtil() {}

    public static String getCurrentLoginId() {
        final Authentication authentication = SecurityContextHolder.getContext().getAuthentication();

        if (authentication == null || authentication.getName() == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND_USER);
        }

        return authentication.getName();
    }
}
