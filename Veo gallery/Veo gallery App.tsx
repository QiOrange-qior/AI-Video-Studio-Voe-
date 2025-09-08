/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, {useState} from 'react';
import {EditVideoPage} from './components/EditVideoPage.tsx';
import {ErrorModal} from './components/ErrorModal.tsx';
import {VideoCameraIcon} from './components/icons.tsx';
import {SavingProgressPage} from './components/SavingProgressPage.tsx';
import {VideoGrid} from './components/VideoGrid.tsx';
import {VideoPlayer} from './components/VideoPlayer.tsx';
import {MOCK_VIDEOS} from './Veo gallery constants.ts';
import {Video} from './Veo gallery types.ts';

import {GeneratedVideo, GoogleGenAI} from '@google/genai';

const VEO_MODEL_NAME = 'veo-2.0-generate-001';

// ---

function bloblToBase64(blob: Blob) {
  return new Promise<string>(async (resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      resolve(url.split(',')[1]);
    };
    reader.readAsDataURL(blob);
  });
}

// ---

async function generateVideoFromText(
  prompt: string,
  apiKey: string,
  numberOfVideos = 1,
): Promise<string[]> {
  const ai = new GoogleGenAI({apiKey});
  let operation = await ai.models.generateVideos({
    model: VEO_MODEL_NAME,
    prompt,
    config: {
      numberOfVideos,
      aspectRatio: '16:9',
    },
  });

  while (!operation.done) {
    await new Promise((resolve) => setTimeout(resolve, 10000));
    console.log('...Generating...');
    operation = await ai.operations.getVideosOperation({operation});
  }

  if (operation?.response) {
    const videos = operation.response?.generatedVideos;
    if (videos === undefined || videos.length === 0) {
      throw new Error('No videos generated');
    }

    return await Promise.all(
      videos.map(async (generatedVideo: GeneratedVideo) => {
        const url = decodeURIComponent(generatedVideo.video.uri);
        const res = await fetch(`${url}&key=${apiKey}`);
        if (!res.ok) {
          throw new Error(
            `Failed to fetch video: ${res.status} ${res.statusText}`,
          );
        }
        const blob = await res.blob();
        return bloblToBase64(blob);
      }),
    );
  } else {
    throw new Error('No videos generated');
  }
}

interface AppProps {
  getApiKey: () => string | null;
  openApiKeyModal: () => void;
}

/**
 * Main component for the Veo Gallery app.
 * It manages the state of videos, playing videos, editing videos and error handling.
 */
export const App: React.FC<AppProps> = ({ getApiKey, openApiKeyModal }) => {
  const [videos, setVideos] = useState<Video[]>(MOCK_VIDEOS);
  const [playingVideo, setPlayingVideo] = useState<Video | null>(null);
  const [editingVideo, setEditingVideo] = useState<Video | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [generationError, setGenerationError] = useState<string[] | null>(null);

  const handlePlayVideo = (video: Video) => {
    setPlayingVideo(video);
  };

  const handleClosePlayer = () => {
    setPlayingVideo(null);
  };

  const handleStartEdit = (video: Video) => {
    setPlayingVideo(null); // Close player
    setEditingVideo(video); // Open edit page
  };

  const handleCancelEdit = () => {
    setEditingVideo(null); // Close edit page, return to grid
  };

  const handleSaveEdit = async (originalVideo: Video) => {
    setEditingVideo(null);
    setIsSaving(true);
    setGenerationError(null);
    
    const apiKey = getApiKey();
    if (!apiKey) {
        setGenerationError([
            'API Key is not configured in the app settings.',
            'Please configure your API key to generate videos.',
        ]);
        setIsSaving(false);
        openApiKeyModal();
        return;
    }

    try {
      const promptText = originalVideo.description;
      console.log('Generating video...', promptText);
      const videoObjects = await generateVideoFromText(promptText, apiKey);

      if (!videoObjects || videoObjects.length === 0) {
        throw new Error('Video generation returned no data.');
      }

      console.log('Generated video data received.');

      const mimeType = 'video/mp4';
      const videoSrc = videoObjects[0];
      const src = `data:${mimeType};base64,${videoSrc}`;

      const newVideo: Video = {
        id: self.crypto.randomUUID(),
        title: `Remix of "${originalVideo.title}"`,
        description: originalVideo.description,
        videoUrl: src,
      };

      setVideos((currentVideos) => [newVideo, ...currentVideos]);
      setPlayingVideo(newVideo); // Go to the new video
    } catch (error) {
      console.error('Video generation failed:', error);
      const errorMessage = (error as Error).message || 'An unknown error occurred.';
      setGenerationError([
        'Sorry, something went wrong during video generation.',
        `Details: ${errorMessage}`,
      ]);
    } finally {
      setIsSaving(false);
    }
  };

  if (isSaving) {
    return <SavingProgressPage />;
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 font-sans">
      {editingVideo ? (
        <EditVideoPage
          video={editingVideo}
          onSave={handleSaveEdit}
          onCancel={handleCancelEdit}
        />
      ) : (
        <div className="mx-auto max-w-[1080px]">
          <header className="p-6 md:p-8 text-center">
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-purple-400 via-pink-500 to-red-500 text-transparent bg-clip-text inline-flex items-center gap-4">
              <VideoCameraIcon className="w-10 h-10 md:w-12 md:h-12" />
              <span>Veo Gallery</span>
            </h1>
            <p className="text-gray-400 mt-2 text-lg">
              Select a video to generate your own variations
            </p>
          </header>
          <main className="px-4 md:px-8 pb-8">
            <VideoGrid videos={videos} onPlayVideo={handlePlayVideo} />
          </main>
        </div>
      )}

      {playingVideo && (
        <VideoPlayer
          video={playingVideo}
          onClose={handleClosePlayer}
          onEdit={handleStartEdit}
        />
      )}

      {generationError && (
        <ErrorModal
          message={generationError}
          onClose={() => setGenerationError(null)}
          onSelectKey={openApiKeyModal}
        />
      )}
    </div>
  );
};