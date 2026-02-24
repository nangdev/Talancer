package com.example.talancer.common.auth;

import com.example.talancer.domain.user.entity.Role;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jws;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.security.Key;
import java.util.Date;

@Component
public class JwtProvider {
    private final Key key = Keys.secretKeyFor(SignatureAlgorithm.HS256);

    @Value("${jwt.access-token-expiration}")
    private long expireMs;

    public String generateToken(String loginId, Role role) {
        return Jwts.builder()
                .setSubject(loginId)
                .claim("role", role.name())
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + expireMs))
                .signWith(key)
                .compact();
    }

    public Jws<Claims> validateToken(String token) {
        return Jwts.parser().setSigningKey(key).build().parseClaimsJws(token);
    }

    public String getNickname(String token) {
        return validateToken(token).getBody().getSubject();
    }

    public String getRole(String token) {
        return (String) validateToken(token).getBody().get("role");
    }
}
