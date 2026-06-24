import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAboutProfile } from "../api/posts";
import { AboutPage } from "./AboutPage";

vi.mock("../api/posts", () => ({
  fetchAboutProfile: vi.fn()
}));

const mockedFetchAboutProfile = vi.mocked(fetchAboutProfile);

describe("AboutPage", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders the about profile in the Black File identity layout", async () => {
    mockedFetchAboutProfile.mockResolvedValue({
      about: {
        displayName: "TwoRiver",
        headline: "Building quiet systems for long-running work.",
        bio: "I write about engineering decisions, product systems, and durable tools.",
        avatarUrl: "",
        githubUrl: "https://github.com/tworiver",
        email: "hello@tworiver.dev",
        socialLinks: [
          { label: "RSS", url: "/feed.xml" },
          { label: "X", url: "https://x.com/tworiver" },
          { label: "LinkedIn", url: "https://linkedin.com/in/tworiver" },
          { label: "Ins", url: "https://instagram.com/tworiver" },
          { label: "Notes", url: "notes.tworiver.dev" }
        ],
        updatedAt: "2026-06-11T00:00:00.000Z"
      }
    });

    render(<AboutPage locale="en" />);

    expect(await screen.findByRole("heading", { name: "TwoRiver" })).toBeInTheDocument();
    expect(screen.queryByText("WRITE")).not.toBeInTheDocument();
    expect(screen.queryByText("BUILD")).not.toBeInTheDocument();
    expect(screen.queryByText("SHIP")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Email" })).toHaveAttribute("href", "mailto:hello@tworiver.dev");
    expect(screen.getByRole("link", { name: "GitHub" })).toHaveAttribute("href", "https://github.com/tworiver");
    expect(screen.getByRole("link", { name: "RSS" })).toHaveAttribute("href", "/feed.xml");
    expect(screen.getByRole("link", { name: "X" })).toHaveAttribute("href", "https://x.com/tworiver");
    expect(screen.getByRole("link", { name: "LinkedIn" })).toHaveAttribute("href", "https://linkedin.com/in/tworiver");
    expect(screen.getByRole("link", { name: "Ins" })).toHaveAttribute("href", "https://instagram.com/tworiver");
    expect(screen.getByRole("link", { name: "Notes" })).toHaveAttribute("href", "https://notes.tworiver.dev");
    expect(screen.queryByText("hello@tworiver.dev")).not.toBeInTheDocument();
    expect(screen.queryByText("github.com/tworiver")).not.toBeInTheDocument();
    expect(screen.queryByText("/feed.xml")).not.toBeInTheDocument();

    const contactLinks = screen.getAllByRole("link");
    expect(contactLinks.map((link) => link.getAttribute("aria-label"))).toEqual([
      "Email",
      "GitHub",
      "RSS",
      "X",
      "LinkedIn",
      "Ins",
      "Notes"
    ]);
    expect(contactLinks).toHaveLength(7);
    const customLink = contactLinks[6];
    if (!customLink) {
      throw new Error("Expected the custom contact link to render.");
    }
    expect(contactLinks.slice(0, 6).every((link) => link.querySelector("svg"))).toBe(true);
    expect(customLink.querySelector("svg")).toBeNull();
    expect(customLink).toHaveTextContent("NO");
  });

  it("renders an uploaded about avatar with the public profile portrait treatment", async () => {
    mockedFetchAboutProfile.mockResolvedValue({
      about: {
        displayName: "TwoRiver",
        headline: "Building quiet systems for long-running work.",
        bio: "I write about engineering decisions, product systems, and durable tools.",
        avatarUrl: "/uploads/images/about/avatar.png",
        githubUrl: "",
        email: "",
        socialLinks: [],
        updatedAt: "2026-06-11T00:00:00.000Z"
      }
    });

    render(<AboutPage locale="en" />);

    const avatar = await screen.findByRole("img", { name: "TwoRiver avatar" });
    expect(avatar).toHaveAttribute("src", "http://localhost:4000/uploads/images/about/avatar.png");
    expect(avatar.closest(".about-file-portrait")).toHaveClass("about-file-portrait--round");
  });
});
