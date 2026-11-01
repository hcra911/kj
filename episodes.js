/*
  EPISODE CONFIG — the only file you normally need to edit.

  By default every episode looks for a video file named after its number:

      videos/s1/e01.mp4   ... videos/s1/e26.mp4    (Season 1)
      videos/s2/e01.mp4   ... videos/s2/e26.mp4    (Season 2)

  Drop your files in those folders and the player finds them automatically.
  Optional subtitles use the same name with .vtt:  videos/s1/e01.vtt

  To override a single episode, add it under `episodes` for that season:

      episodes: {
        3: { title: "My own title", src: "videos/s1/kaiji-03.webm" },        // different file name
        4: { src: "https://your-cdn.example/stream/e04.m3u8" },              // HLS stream
        5: { embed: "https://player.example/embed/abc123" }                  // embeddable player page
      }

  Only use files and embeds you own or have permission to use.
  Supported: MP4 (H.264/AAC) and WebM play in every browser; .m3u8 (HLS) is also supported.
*/
window.KAIJI_CONFIG = {
  videoPattern: "videos/s{s}/e{ee}.mp4",        // {s} season, {e} episode, {ee} episode padded to 2 digits
  subtitlePattern: "videos/s{s}/e{ee}.vtt",     // set to "" to turn subtitles off
  subtitleLang: "en",
  subtitleLabel: "English",
  skipSeconds: 85,                              // length of the "Skip" button (opening skip)

  seasons: {
    1: { title: "Kaiji: Ultimate Survivor", count: 26, episodes: {} },
    2: { title: "Kaiji: Against All Rules", count: 26, episodes: {} }
  }
};
