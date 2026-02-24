package com.example.talancer.domain.verb.entity;

import com.example.talancer.domain.meeting.entity.Meeting;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Getter
@NoArgsConstructor
@Builder
@AllArgsConstructor
public class Verb {
    @Id
    @Column(name = "verb_id")
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long verbId;

    private String speaker;

    private Double start;

    private Double end;

    @Column(columnDefinition = "longtext")
    private String text;

    private String audioObjectKey;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "meeting_id")
    private Meeting meeting;

    public void updateSpeaker(String speaker) {
        this.speaker = speaker;
    }
}
