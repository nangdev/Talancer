package com.example.talancer.domain.verb.repository;

import com.example.talancer.domain.verb.entity.Verb;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface VerbRepository extends JpaRepository<Verb, Long> {
    List<Verb> findAllByMeetingMeetingIdOrderByStartAsc(Long meetingId);
    void deleteAllByMeetingMeetingId(Long meetingId);
}
