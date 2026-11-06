#!/usr/bin/env python3
"""StudyBuddy - a lightweight personal study planner and quiz helper."""

from __future__ import annotations

import argparse
import json
import os
import random
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

DATA_FILE = Path(__file__).with_name("studybuddy_data.json")


def safe_input(prompt: str, default: str = "") -> str:
    try:
        value = input(prompt)
    except (EOFError, KeyboardInterrupt):
        print()
        return default
    return value if value != "" else default


@dataclass
class Topic:
    name: str
    goal: str
    streak: int = 0
    last_studied: str | None = None


@dataclass
class Flashcard:
    question: str
    answer: str
    topic: str
    confidence: int = 0
    last_reviewed: str | None = None


class StudyBuddy:
    def __init__(self, data_file: Path = DATA_FILE) -> None:
        self.data_file = data_file
        self.data: dict[str, Any] = self._load_data()

    def _load_data(self) -> dict[str, Any]:
        if not self.data_file.exists():
            return {"topics": {}, "flashcards": [], "sessions": []}

        try:
            with self.data_file.open("r", encoding="utf-8") as handle:
                data = json.load(handle)
        except (json.JSONDecodeError, OSError):
            return {"topics": {}, "flashcards": [], "sessions": []}

        data.setdefault("topics", {})
        data.setdefault("flashcards", [])
        data.setdefault("sessions", [])
        return data

    def _save_data(self) -> None:
        with self.data_file.open("w", encoding="utf-8") as handle:
            json.dump(self.data, handle, indent=2)
            handle.write("\n")

    def add_topic(self, name: str, goal: str) -> None:
        topic_name = name.strip()
        if not topic_name:
            raise ValueError("Topic name cannot be blank.")
        if topic_name in self.data["topics"]:
            self.data["topics"][topic_name]["goal"] = goal.strip() or self.data["topics"][topic_name]["goal"]
            self._save_data()
            print(f"Updated topic '{topic_name}'.")
            return

        self.data["topics"][topic_name] = {
            "name": topic_name,
            "goal": goal.strip() or "Stay consistent and review regularly.",
            "streak": 0,
            "last_studied": None,
        }
        self._save_data()
        print(f"Added topic '{topic_name}'.")

    def add_flashcard(self, topic: str, question: str, answer: str) -> None:
        topic_name = topic.strip()
        question = question.strip()
        answer = answer.strip()

        if not topic_name or not question or not answer:
            raise ValueError("Topic, question, and answer cannot be blank.")
        if topic_name not in self.data["topics"]:
            self.add_topic(topic_name, "Review this topic regularly.")

        card = {
            "question": question,
            "answer": answer,
            "topic": topic_name,
            "confidence": 0,
            "last_reviewed": None,
        }
        self.data["flashcards"].append(card)
        self._save_data()
        print(f"Added flashcard for '{topic_name}'.")

    def list_topics(self) -> None:
        if not self.data["topics"]:
            print("No topics yet. Add one to begin.")
            return

        print("Topics:")
        for name, info in self.data["topics"].items():
            card_count = sum(1 for card in self.data["flashcards"] if card["topic"] == name)
            last_studied = info.get("last_studied") or "Never"
            print(f"- {name}: {info['goal']} | cards: {card_count} | last studied: {last_studied}")

    def study_topic(self, topic_name: str, minutes: int = 10) -> None:
        if topic_name not in self.data["topics"]:
            print(f"Topic '{topic_name}' does not exist.")
            return

        cards = [card for card in self.data["flashcards"] if card["topic"] == topic_name]
        if not cards:
            print(f"No flashcards available for '{topic_name}'.")
            return

        print(f"\nStudying '{topic_name}' for {minutes} minutes.")
        for index, card in enumerate(cards, start=1):
            print(f"\nCard {index}/{len(cards)}")
            print(f"Q: {card['question']}")
            safe_input("Press Enter to reveal the answer... ")
            print(f"A: {card['answer']}")

            rating = safe_input("How well did you know this? [0-5, 5=perfect]: ", "0").strip()
            try:
                score = int(rating)
            except ValueError:
                score = 0
            score = max(0, min(5, score))
            card["confidence"] = score
            card["last_reviewed"] = datetime.now().isoformat(timespec="minutes")

        self.data["topics"][topic_name]["last_studied"] = datetime.now().isoformat(timespec="minutes")
        self.data["topics"][topic_name]["streak"] += 1
        self.data["sessions"].append(
            {
                "topic": topic_name,
                "minutes": minutes,
                "timestamp": datetime.now().isoformat(timespec="seconds"),
            }
        )
        self._save_data()
        print(f"\nSession complete for '{topic_name}'.")

    def run_quiz(self, topic_name: str | None = None) -> None:
        cards = self.data["flashcards"]
        if topic_name:
            cards = [card for card in cards if card["topic"] == topic_name]
        if not cards:
            print("No flashcards available for a quiz yet.")
            return

        random.shuffle(cards)
        score = 0
        total = min(5, len(cards))

        print(f"\nStarting quiz with {total} question(s).")
        for i in range(total):
            card = cards[i]
            print(f"\nQuestion {i + 1}: {card['question']}")
            answer = safe_input("Your answer: ", "").strip().lower()
            if answer == card["answer"].strip().lower():
                score += 1
                print("Correct!")
            else:
                print(f"Not quite. The correct answer is: {card['answer']}")

        print(f"\nFinal score: {score}/{total}.")

    def run_timer(self, minutes: int) -> None:
        minutes = max(1, int(minutes))
        total_seconds = minutes * 60
        print(f"\nPomodoro timer started for {minutes} minute(s).")
        for remaining in range(total_seconds, 0, -1):
            mins, secs = divmod(remaining, 60)
            print(f"\rTime left: {mins:02d}:{secs:02d}", end="", flush=True)
            time.sleep(1)
        print("\n\nTime's up! Take a quick break.")

    def daily_summary(self) -> None:
        print("\nDaily summary")
        print("-" * 40)
        if not self.data["topics"]:
            print("Add a topic to see your study overview.")
            return

        total_cards = len(self.data["flashcards"])
        total_sessions = len(self.data["sessions"])
        print(f"Topics tracked: {len(self.data['topics'])}")
        print(f"Flashcards: {total_cards}")
        print(f"Study sessions logged: {total_sessions}")

        for name, info in self.data["topics"].items():
            topic_cards = sum(1 for card in self.data["flashcards"] if card["topic"] == name)
            session_count = sum(1 for session in self.data["sessions"] if session["topic"] == name)
            print(f"- {name}: {topic_cards} cards | {session_count} sessions | streak {info.get('streak', 0)}")

    def interactive(self) -> None:
        while True:
            print("\nStudyBuddy")
            print("1) List topics")
            print("2) Add topic")
            print("3) Add flashcard")
            print("4) Study topic")
            print("5) Quiz me")
            print("6) Pomodoro timer")
            print("7) Summary")
            print("8) Exit")
            choice = safe_input("Choose an option: ", "8").strip()

            if choice == "1":
                self.list_topics()
            elif choice == "2":
                name = safe_input("Topic name: ", "").strip()
                goal = safe_input("Goal: ", "").strip()
                self.add_topic(name, goal)
            elif choice == "3":
                topic = safe_input("Topic: ", "").strip()
                question = safe_input("Question: ", "").strip()
                answer = safe_input("Answer: ", "").strip()
                self.add_flashcard(topic, question, answer)
            elif choice == "4":
                topic = safe_input("Topic to study: ", "").strip()
                minutes = safe_input("Minutes (default 10): ", "10").strip() or "10"
                self.study_topic(topic, int(minutes))
            elif choice == "5":
                topic = safe_input("Topic filter (optional): ", "").strip() or None
                self.run_quiz(topic)
            elif choice == "6":
                minutes = safe_input("Minutes: ", "25").strip() or "25"
                self.run_timer(int(minutes))
            elif choice == "7":
                self.daily_summary()
            elif choice == "8":
                print("See you next study session!")
                break
            else:
                print("Invalid option. Please choose a number from 1 to 8.")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="StudyBuddy - your personal study companion.")
    subparsers = parser.add_subparsers(dest="command")

    add_topic = subparsers.add_parser("add-topic", help="Add a new study topic")
    add_topic.add_argument("name")
    add_topic.add_argument("goal", nargs="?", default="Stay consistent and review regularly.")

    add_card = subparsers.add_parser("add-card", help="Add a flashcard")
    add_card.add_argument("topic")
    add_card.add_argument("question")
    add_card.add_argument("answer")

    subparsers.add_parser("list-topics", help="List all tracked study topics")
    subparsers.add_parser("summary", help="Show the current study overview")

    study = subparsers.add_parser("study", help="Study a topic")
    study.add_argument("topic")
    study.add_argument("minutes", nargs="?", type=int, default=10)

    quiz = subparsers.add_parser("quiz", help="Run a quick quiz")
    quiz.add_argument("topic", nargs="?", default=None)

    timer = subparsers.add_parser("timer", help="Run a Pomodoro-style timer")
    timer.add_argument("minutes", nargs="?", type=int, default=25)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    app = StudyBuddy()

    if not args.command:
        app.interactive()
        return 0

    try:
        if args.command == "add-topic":
            app.add_topic(args.name, args.goal)
        elif args.command == "add-card":
            app.add_flashcard(args.topic, args.question, args.answer)
        elif args.command == "list-topics":
            app.list_topics()
        elif args.command == "summary":
            app.daily_summary()
        elif args.command == "study":
            app.study_topic(args.topic, args.minutes)
        elif args.command == "quiz":
            app.run_quiz(args.topic)
        elif args.command == "timer":
            app.run_timer(args.minutes)
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
