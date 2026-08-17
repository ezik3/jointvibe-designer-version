import { useEffect, useRef } from 'react';

interface VideoPost {
  id: string;
  video_url?: string;
}

// Global video cache
const videoCache = new Map<string, HTMLVideoElement>();

export function preloadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    if (videoCache.has(url)) {
      resolve(videoCache.get(url)!);
      return;
    }

    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    
    video.onloadeddata = () => {
      videoCache.set(url, video);
      resolve(video);
    };
    
    video.onerror = reject;
    video.src = url;
    video.load();
  });
}

export function useVideoPreload(posts: VideoPost[], currentIndex: number) {
  const preloadedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!posts.length) return;

    // Preload current, next, and next+1 videos for instant playback
    const indicesToPreload = [
      currentIndex,
      currentIndex + 1,
      currentIndex + 2,
    ].filter(i => i >= 0 && i < posts.length);

    indicesToPreload.forEach(index => {
      const post = posts[index];
      if (post?.video_url && !preloadedRef.current.has(post.video_url)) {
        preloadedRef.current.add(post.video_url);
        preloadVideo(post.video_url).catch(() => {
          // Silently fail - video will load normally
        });
      }
    });
  }, [posts, currentIndex]);

  return {
    isPreloaded: (url: string) => videoCache.has(url),
    getPreloadedVideo: (url: string) => videoCache.get(url),
  };
}

// Preload videos on initial app load
export function preloadInitialVideos(posts: VideoPost[]) {
  const videoPosts = posts.filter(p => p.video_url).slice(0, 3);
  videoPosts.forEach(post => {
    if (post.video_url) {
      preloadVideo(post.video_url).catch(() => {});
    }
  });
}
