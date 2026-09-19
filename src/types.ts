// A post image that has already been loaded (from a file upload or URL)
// so its natural dimensions are known before rendering.
export interface LoadedImage {
  img: HTMLImageElement;
  width: number;
  height: number;
}

export interface Engagement {
  likes?: string;
  comments?: string;
  reposts?: string;
  views?: string;
}

// Everything the renderer needs. Every field is either retrieved from the
// public post, auto-imported, or typed in by the user in manual mode.
// Nothing here is ever invented by the app.
export interface PostData {
  postId: string;
  displayName: string;
  username: string;
  avatar: HTMLImageElement | null;
  text: string;
  timestamp: string;
  images: LoadedImage[];
  engagement: Engagement;
}
