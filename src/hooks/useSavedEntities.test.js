import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { useSavedEntities } from "./useSavedEntities";

beforeEach(() => {
  localStorage.clear();
});

describe("useSavedEntities", () => {
  // ── Estado inicial ────────────────────────────────────────────────────────

  it("should start with empty lists when localStorage is empty", () => {
    const { result } = renderHook(() => useSavedEntities());
    expect(result.current.likedAlbums).toEqual([]);
    expect(result.current.followedArtists).toEqual([]);
  });

  it("should load persisted albums and artists on mount", () => {
    localStorage.setItem(
      "sw_liked_albums_v1",
      JSON.stringify([{ browseId: "ALB1", title: "After Hours" }]),
    );
    localStorage.setItem(
      "sw_followed_artists_v1",
      JSON.stringify([{ browseId: "UC1", name: "The Weeknd" }]),
    );
    const { result } = renderHook(() => useSavedEntities());
    expect(result.current.likedAlbums).toHaveLength(1);
    expect(result.current.likedAlbums[0].title).toBe("After Hours");
    expect(result.current.followedArtists).toHaveLength(1);
    expect(result.current.followedArtists[0].name).toBe("The Weeknd");
  });

  it("should return [] for corrupted localStorage values", () => {
    localStorage.setItem("sw_liked_albums_v1", "{not json");
    localStorage.setItem("sw_followed_artists_v1", JSON.stringify({ no: "array" }));
    const { result } = renderHook(() => useSavedEntities());
    expect(result.current.likedAlbums).toEqual([]);
    expect(result.current.followedArtists).toEqual([]);
  });

  // ── toggleAlbumLike ───────────────────────────────────────────────────────

  it("should add an album with metadata on toggle", () => {
    const { result } = renderHook(() => useSavedEntities());
    act(() =>
      result.current.toggleAlbumLike({
        browseId: "ALB1",
        title: "After Hours",
        artist: "The Weeknd",
        type: "Álbum",
        year: "2020",
        artistBrowseId: "UC1",
        thumbnails: [],
      }),
    );
    expect(result.current.likedAlbums).toHaveLength(1);
    expect(result.current.likedAlbums[0]).toMatchObject({
      browseId: "ALB1",
      title: "After Hours",
      artist: "The Weeknd",
      year: "2020",
    });
    expect(result.current.likedAlbums[0].likedAt).toBeTruthy();
    expect(result.current.isAlbumLiked("ALB1")).toBe(true);
  });

  it("should persist albums to localStorage on toggle", () => {
    const { result } = renderHook(() => useSavedEntities());
    act(() => result.current.toggleAlbumLike({ browseId: "ALB1", title: "X" }));
    const stored = JSON.parse(localStorage.getItem("sw_liked_albums_v1"));
    expect(stored).toHaveLength(1);
    expect(stored[0].browseId).toBe("ALB1");
  });

  it("should remove an album when toggled twice", () => {
    const { result } = renderHook(() => useSavedEntities());
    act(() => {
      expect(result.current.toggleAlbumLike({ browseId: "ALB1", title: "X" })).toBe(true);
    });
    let removed;
    act(() => {
      removed = result.current.toggleAlbumLike({ browseId: "ALB1", title: "X" });
    });
    expect(removed).toBe(false);
    expect(result.current.likedAlbums).toHaveLength(0);
    expect(result.current.isAlbumLiked("ALB1")).toBe(false);
    const stored = JSON.parse(localStorage.getItem("sw_liked_albums_v1"));
    expect(stored).toHaveLength(0);
  });

  it("should return false without a browseId", () => {
    const { result } = renderHook(() => useSavedEntities());
    expect(result.current.toggleAlbumLike({ title: "Sin id" })).toBe(false);
    expect(result.current.toggleAlbumLike(null)).toBe(false);
    expect(result.current.likedAlbums).toHaveLength(0);
  });

  // ── toggleFollow ──────────────────────────────────────────────────────────

  it("should add an artist with metadata on toggle", () => {
    const { result } = renderHook(() => useSavedEntities());
    act(() =>
      result.current.toggleFollow({
        browseId: "UC1",
        name: "The Weeknd",
        thumbnails: [{ url: "http://img" }],
      }),
    );
    expect(result.current.followedArtists).toHaveLength(1);
    expect(result.current.followedArtists[0]).toMatchObject({
      browseId: "UC1",
      name: "The Weeknd",
      thumbnail: "http://img",
    });
    expect(result.current.isArtistFollowed("UC1")).toBe(true);
    expect(result.current.isArtistFollowed({ browseId: "UC1" })).toBe(true);
  });

  it("should persist artists to localStorage on toggle", () => {
    const { result } = renderHook(() => useSavedEntities());
    act(() => result.current.toggleFollow({ browseId: "UC1", name: "X" }));
    const stored = JSON.parse(localStorage.getItem("sw_followed_artists_v1"));
    expect(stored).toHaveLength(1);
    expect(stored[0].browseId).toBe("UC1");
  });

  it("should accept a plain string artist name", () => {
    const { result } = renderHook(() => useSavedEntities());
    act(() => result.current.toggleFollow("Dua Lipa"));
    expect(result.current.followedArtists).toHaveLength(1);
    expect(result.current.followedArtists[0].name).toBe("Dua Lipa");
    expect(result.current.isArtistFollowed("Dua Lipa")).toBe(true);
    act(() => result.current.toggleFollow("Dua Lipa"));
    expect(result.current.followedArtists).toHaveLength(0);
  });

  it("should remove a followed artist when toggled twice", () => {
    const { result } = renderHook(() => useSavedEntities());
    act(() => result.current.toggleFollow({ browseId: "UC1", name: "X" }));
    act(() => result.current.toggleFollow({ browseId: "UC1", name: "X" }));
    expect(result.current.followedArtists).toHaveLength(0);
    expect(result.current.isArtistFollowed("UC1")).toBe(false);
    const stored = JSON.parse(localStorage.getItem("sw_followed_artists_v1"));
    expect(stored).toHaveLength(0);
  });

  it("should return false for an empty artist", () => {
    const { result } = renderHook(() => useSavedEntities());
    expect(result.current.toggleFollow({})).toBe(false);
    expect(result.current.toggleFollow("")).toBe(false);
  });
});
