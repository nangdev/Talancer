FROM gradle:8.7-jdk17 AS build
WORKDIR /app
COPY . .
RUN gradle clean bootJar -x test

# run stage
FROM eclipse-temurin:17-jre
WORKDIR /app

COPY --from=build /app/build/libs/*.jar app.jar

# 애플리케이션 포트 설정
EXPOSE 8088

# 실행 명령어
ENTRYPOINT ["java", "-jar", "app.jar"]