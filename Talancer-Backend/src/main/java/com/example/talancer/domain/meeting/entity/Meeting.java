package com.example.talancer.domain.meeting.entity;

import com.example.talancer.common.entity.BaseEntity;
import com.example.talancer.domain.user.entity.User;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Meeting extends BaseEntity {
    @Id
    @Column(name = "meeting_id")
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long meetingId;

    private String title;

    private Status status;

    @Column(name = "start_at")
    private LocalDateTime startAt;

    @Column(name = "ended_at")
    private LocalDateTime endedAt;

    private String audioObjectKey;

    private String audioFileName;

    private String audioContentType;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    private User user;

    public void updateStatus(Status status) {
        this.status = status;
    }

    public void updateAudio(String audioObjectKey, String audioFileName, String audioContentType) {
        this.audioObjectKey = audioObjectKey;
        this.audioFileName = audioFileName;
        this.audioContentType = audioContentType;
    }
}
