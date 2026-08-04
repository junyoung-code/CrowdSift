"use client";

import { ArrowRight, ShieldCheck } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const sections = [
  { id: "problems", label: "문제" },
  { id: "solutions", label: "해결 방식" },
  { id: "analysis", label: "AI 분석" },
  { id: "integration", label: "연결" },
] as const;

export function LandingHeader() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [scrollDirection, setScrollDirection] = useState<"up" | "down">("up");
  const [activeSection, setActiveSection] = useState<string>();
  const previousScrollY = useRef(0);

  useEffect(() => {
    let isScheduled = false;

    const updateHeader = () => {
      const currentScrollY = window.scrollY;
      setIsScrolled(currentScrollY > 24);
      setScrollDirection(
        currentScrollY > previousScrollY.current ? "down" : "up",
      );
      previousScrollY.current = currentScrollY;
      isScheduled = false;
    };

    const handleScroll = () => {
      if (isScheduled) return;
      isScheduled = true;
      window.requestAnimationFrame(updateHeader);
    };

    updateHeader();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const targets = sections
      .map(({ id }) => document.getElementById(id))
      .filter((target): target is HTMLElement => target !== null);

    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const current = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (current) setActiveSection(current.target.id);
      },
      { rootMargin: "-22% 0px -68%", threshold: [0, 0.25, 0.5, 0.75] },
    );

    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, []);

  return (
    <header
      className={[
        "landing-header",
        isScrolled ? "landing-header-scrolled" : "",
        scrollDirection === "down" ? "landing-header-down" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      id="top"
    >
      <Link className="brand" href="/" aria-label="CrowdSift 홈">
        <span className="brand-mark" aria-hidden="true">
          <ShieldCheck weight="fill" />
        </span>
        <strong>CrowdSift</strong>
      </Link>

      <nav aria-label="제품 소개">
        {sections.map(({ id, label }) => (
          <a
            href={`#${id}`}
            aria-current={activeSection === id ? "location" : undefined}
            key={id}
          >
            {label}
          </a>
        ))}
      </nav>

      <div className="header-actions">
        <Link className="login-link" href="/auth/sign-in">
          로그인
        </Link>
        <Link className="button button-primary button-small" href="/auth/sign-in">
          시작하기
          <ArrowRight aria-hidden="true" weight="bold" />
        </Link>
      </div>
    </header>
  );
}
