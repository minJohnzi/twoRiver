import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAdminAboutProfile, updateAdminAboutProfile, uploadAdminAboutAvatar } from "../api/admin";
import { AdminAboutPage } from "./AdminAboutPage";

vi.mock("../api/admin", () => ({
  fetchAdminAboutProfile: vi.fn(),
  updateAdminAboutProfile: vi.fn(),
  uploadAdminAboutAvatar: vi.fn()
}));

const mockedFetchAdminAboutProfile = vi.mocked(fetchAdminAboutProfile);
const mockedUpdateAdminAboutProfile = vi.mocked(updateAdminAboutProfile);
const mockedUploadAdminAboutAvatar = vi.mocked(uploadAdminAboutAvatar);

function imageFile(name = "avatar.png", type = "image/png") {
  return new File(["image-bytes"], name, { type });
}

describe("AdminAboutPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFetchAdminAboutProfile.mockResolvedValue({
      about: {
        displayName: "TwoRiver",
        headline: "",
        bio: "",
        avatarUrl: "",
        githubUrl: "",
        email: "",
        socialLinks: [],
        updatedAt: "2026-06-11T00:00:00.000Z"
      }
    });
    mockedUpdateAdminAboutProfile.mockImplementation(async (input) => ({
      about: {
        ...input,
        updatedAt: "2026-06-11T00:00:00.000Z"
      }
    }));
    mockedUploadAdminAboutAvatar.mockResolvedValue({
      url: "/uploads/images/about/avatar.png"
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("uploads an avatar image and saves the uploaded avatar URL", async () => {
    const file = imageFile();

    render(
      <MemoryRouter>
        <AdminAboutPage locale="en" />
      </MemoryRouter>
    );

    const input = await screen.findByLabelText("Upload avatar image");
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(mockedUploadAdminAboutAvatar).toHaveBeenCalledWith(file));
    await waitFor(() => expect(screen.getAllByAltText("About avatar preview")).toHaveLength(2));
    for (const preview of screen.getAllByAltText("About avatar preview")) {
      expect(preview).toHaveAttribute("src", "http://localhost:4000/uploads/images/about/avatar.png");
    }

    fireEvent.click(screen.getByRole("button", { name: "Save about" }));

    await waitFor(() =>
      expect(mockedUpdateAdminAboutProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          avatarUrl: "/uploads/images/about/avatar.png"
        })
      )
    );
  });

  it("shows default contact rows and only saves filled social links", async () => {
    render(
      <MemoryRouter>
        <AdminAboutPage locale="en" />
      </MemoryRouter>
    );

    expect(await screen.findByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("GitHub")).toBeInTheDocument();
    expect(screen.getByLabelText("RSS URL")).toBeInTheDocument();
    expect(screen.getByLabelText("X URL")).toBeInTheDocument();
    expect(screen.getByLabelText("LinkedIn URL")).toBeInTheDocument();
    expect(screen.getByLabelText("Ins URL")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("RSS URL"), { target: { value: "/feed.xml" } });
    fireEvent.change(screen.getByLabelText("LinkedIn URL"), { target: { value: "https://linkedin.com/in/tworiver" } });

    fireEvent.click(screen.getByRole("button", { name: "Save about" }));

    await waitFor(() =>
      expect(mockedUpdateAdminAboutProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          socialLinks: [
            { label: "RSS", url: "/feed.xml" },
            { label: "LinkedIn", url: "https://linkedin.com/in/tworiver" }
          ]
        })
      )
    );
  });
});
