/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { GenerateVideosParameters, GoogleGenAI } from '@google/genai';

interface VideoParams {
  aspectRatio?: string;
  generateAudio?: boolean;
}

interface VideoRecord {
  id?: number;
  prompt: string;
  videoBlob: Blob;
  thumbnailBlob: Blob;
  timestamp: number;
}

let geminiApiKey: string | null = null;
const API_KEY_STORAGE_KEY = 'gemini-api-key';

// --- IndexedDB ---
let db: IDBDatabase;
function initDB() {
  const request = indexedDB.open('AIVideoStudioDB', 1);

  request.onupgradeneeded = (event) => {
    const db = (event.target as IDBOpenDBRequest).result;
    if (!db.objectStoreNames.contains('videos')) {
      db.createObjectStore('videos', { keyPath: 'id', autoIncrement: true });
    }
  };

  request.onsuccess = (event) => {
    db = (event.target as IDBOpenDBRequest).result;
    // Load library if it's the current view
    if (!libraryView.classList.contains('hidden')) {
      loadVideosFromLibrary();
    }
  };

  request.onerror = (event) => {
    console.error('IndexedDB error:', (event.target as IDBRequest).error);
  };
}

async function addVideoToLibrary(record: VideoRecord): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject('DB not initialized');
      return;
    }
    const transaction = db.transaction(['videos'], 'readwrite');
    const store = transaction.objectStore('videos');
    const request = store.add(record);
    request.onsuccess = () => resolve();
    request.onerror = (event) =>
      reject('Error adding video: ' + (event.target as IDBRequest).error);
  });
}

async function getAllVideos(): Promise<VideoRecord[]> {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject('DB not initialized');
      return;
    }
    const transaction = db.transaction(['videos'], 'readonly');
    const store = transaction.objectStore('videos');
    const request = store.getAll();
    request.onsuccess = (event) =>
      resolve((event.target as IDBRequest).result); 
    request.onerror = (event) =>
      reject('Error fetching videos: ' + (event.target as IDBRequest).error);
  });
}

// --- Utility Functions ---
async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const url = reader.result as string;
      resolve(url.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function downloadFile(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function generateContent(
  prompt: string,
  imageBytes: string,
  params: VideoParams,
  onProgress: (percent: number) => void
): Promise<Blob> {
  if (!geminiApiKey) {
    throw new Error('API key not found. Please set it in Settings.');
  }
  const ai = new GoogleGenAI({ apiKey: geminiApiKey });

  const config: GenerateVideosParameters = {
    model: 'veo-2.0-generate-001',
    prompt,
    config: {
      numberOfVideos: 1,
    },
  };

  if (params.aspectRatio) config.config.aspectRatio = params.aspectRatio;
  if (params.generateAudio !== undefined) config.config.generateAudio = params.generateAudio;

  if (imageBytes) {
    config.image = {
      imageBytes,
      mimeType: 'image/png', // Assuming PNG, adjust if other types are supported
    };
  }

  let operation = await ai.models.generateVideos(config);

  while (!operation.done) {
    const progress = Number((operation.metadata as any)?.progressPercent) || 0;
    onProgress(progress);
    await delay(5000); // Poll every 5 seconds
    operation = await ai.operations.getVideosOperation({ operation });
  }

  onProgress(100); // Final update before download

  const videos = operation.response?.generatedVideos;
  if (videos === undefined || videos.length === 0) {
    // Check for errors in the operation response if generation failed.
    const error = (operation as any).error;
    if (error) {
      throw new Error(error.message || 'Video generation failed with an unknown error.');
    }
    throw new Error('No videos generated');
  }

  const firstVideo = videos[0];
  const url = `${firstVideo.video.uri}&key=${geminiApiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    const errorBody = await res.json();
    console.error('API Error fetching video:', errorBody);
    throw new Error(
      errorBody?.error?.message || `Failed to fetch video: ${res.statusText}`
    );
  }
  return res.blob();
}

// --- DOM Elements ---
// Views
const generateView = document.querySelector('#generate-view') as HTMLDivElement;
const templatesView = document.querySelector(
  '#templates-view'
) as HTMLDivElement;
const libraryView = document.querySelector('#library-view') as HTMLDivElement;

// Nav
const navGenerate = document.querySelector('#nav-generate') as HTMLButtonElement;
const navTemplates = document.querySelector(
  '#nav-templates'
) as HTMLButtonElement;
const navLibrary = document.querySelector('#nav-library') as HTMLButtonElement;

// Generate View Controls
const promptEl = document.querySelector('#prompt-input') as HTMLTextAreaElement;
const statusEl = document.querySelector('#status') as HTMLParagraphElement;
const video = document.querySelector('#video') as HTMLVideoElement;
const videoPreviewContainer = document.querySelector(
  '#video-preview-container'
) as HTMLDivElement;
const videoPlaceholder = document.querySelector(
  '#video-placeholder'
) as HTMLDivElement;
const placeholderInitialState = document.querySelector(
  '#placeholder-initial-state'
) as HTMLDivElement;
const placeholderGeneratingState = document.querySelector(
  '#placeholder-generating-state'
) as HTMLDivElement;
const progressBar = document.querySelector('#progress-bar') as HTMLDivElement;
const progressPercent = document.querySelector(
  '#progress-percent'
) as HTMLParagraphElement;
const progressStage = document.querySelector(
  '#progress-stage'
) as HTMLParagraphElement;
const generateButton = document.querySelector(
  '#generate-button'
) as HTMLButtonElement;
const generateButtonLabel = generateButton.querySelector(
  '.button-label'
) as HTMLSpanElement;
const downloadButton = document.querySelector(
  '#download-button'
) as HTMLButtonElement;
const textToVideoTab = document.querySelector(
  '#text-to-video-tab'
) as HTMLButtonElement;
const imageToVideoTab = document.querySelector(
  '#image-to-video-tab'
) as HTMLButtonElement;
const imageUploadContainer = document.querySelector(
  '#image-upload-container'
) as HTMLDivElement;
const imageUploadDivider = document.querySelector(
  '#image-upload-divider'
) as HTMLHRElement;
const uploadInput = document.querySelector('#file-input') as HTMLInputElement;
const imgPreview = document.querySelector('#img-preview') as HTMLImageElement;
const styleButtons = document.querySelectorAll('.style-option');
const customPromptButton = document.querySelector('#custom-prompt-button') as HTMLButtonElement;
const formatButtons = document.querySelectorAll('.format-option');
const musicButtons = document.querySelectorAll('.music-option');
const audioToggle = document.querySelector('.audio-toggle') as HTMLDivElement;
const audioSwitch = document.querySelector('#audio-switch') as HTMLInputElement;

// Templates View Controls
const templateCards = document.querySelectorAll('.template-card');

// Library View
const libraryGrid = document.querySelector('#library-grid') as HTMLDivElement;
const libraryPlaceholder = document.querySelector(
  '.library-placeholder'
) as HTMLDivElement;
const sortSelect = document.querySelector('#sort-select') as HTMLSelectElement;


// API Key Modal
const apiKeyModal = document.querySelector('#api-key-modal') as HTMLDivElement;
const modalContent = apiKeyModal.querySelector(
  '.modal-content'
) as HTMLDivElement;
const settingsButton = document.querySelector(
  '#settings-button'
) as HTMLButtonElement;
const apiKeyInput = document.querySelector('#api-key-input') as HTMLInputElement;
const saveKeyButton = document.querySelector(
  '#save-key-button'
) as HTMLButtonElement;
const apiErrorEl = document.querySelector('#api-error') as HTMLParagraphElement;

// Custom Prompt Modal
const customPromptModal = document.querySelector('#custom-prompt-modal') as HTMLDivElement;
const customPromptInput = document.querySelector('#custom-prompt-input') as HTMLTextAreaElement;
const saveCustomPromptButton = document.querySelector('#save-custom-prompt-button') as HTMLButtonElement;
const cancelCustomPromptButton = document.querySelector('#cancel-custom-prompt-button') as HTMLButtonElement;


const allInputs: HTMLInputElement[] = [
  promptEl,
  generateButton,
  uploadInput,
  audioSwitch,
  ...Array.from(styleButtons),
  ...Array.from(formatButtons),
  ...Array.from(musicButtons),
  ...Array.from(document.querySelectorAll('input[name="ai-model"]')),
] as any;

let base64data = '';
let currentVideoURL = '';
let selectedStylePrefix = '';
let customStyleValue = '';
let selectedAspectRatio = '16:9';
let selectedMusicStyle = 'none';
let currentSortOrder: 'newest' | 'oldest' | 'name' = 'newest';


// --- API Key Modal ---
function openApiKeyModal(errorMessage = '') {
  apiErrorEl.textContent = errorMessage;
  apiKeyModal.classList.remove('hidden');
  apiKeyInput.focus();
}

function closeApiKeyModal() {
  apiKeyModal.classList.add('hidden');
  apiKeyInput.value = '';
  apiErrorEl.textContent = '';
}

function loadApiKey() {
  geminiApiKey = localStorage.getItem(API_KEY_STORAGE_KEY);
}

// --- Custom Prompt Modal ---
function openCustomPromptModal() {
  customPromptInput.value = customStyleValue;
  customPromptModal.classList.remove('hidden');
}
function closeCustomPromptModal() {
  customPromptModal.classList.add('hidden');
}


// --- Helper Functions ---
function setActiveButton(buttons: NodeListOf<Element>, selectedButton: Element) {
  buttons.forEach((btn) => btn.classList.remove('active'));
  selectedButton.classList.add('active');
}

function showView(viewId: 'generate' | 'templates' | 'library') {
  generateView.classList.add('hidden');
  templatesView.classList.add('hidden');
  libraryView.classList.add('hidden');
  navGenerate.classList.remove('active');
  navTemplates.classList.remove('active');
  navLibrary.classList.remove('active');

  switch (viewId) {
    case 'generate':
      generateView.classList.remove('hidden');
      navGenerate.classList.add('active');
      break;
    case 'templates':
      templatesView.classList.remove('hidden');
      navTemplates.classList.add('active');
      break;
    case 'library':
      libraryView.classList.remove('hidden');
      navLibrary.classList.add('active');
      loadVideosFromLibrary();
      break;
  }
}

async function createThumbnail(videoElement: HTMLVideoElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');

    const onSeeked = () => {
      videoElement.removeEventListener('seeked', onSeeked);
      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return reject(new Error('Could not get canvas context'));
      }
      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Canvas to Blob conversion failed'));
        }
      }, 'image/jpeg');
    };

    const onLoadedData = () => {
      videoElement.removeEventListener('loadeddata', onLoadedData);
      videoElement.currentTime = 1; // Seek to 1 second to get a frame
    };

    videoElement.addEventListener('seeked', onSeeked);
    videoElement.addEventListener('loadeddata', onLoadedData);

    // If data is already loaded, trigger it manually
    if (videoElement.readyState >= 2) {
      // HAVE_CURRENT_DATA
      onLoadedData();
    }
  });
}

// --- Library Functions ---
async function loadVideosFromLibrary() {
  const videos = await getAllVideos();

  // Sort videos based on the current sort order
  if (currentSortOrder === 'newest') {
    videos.sort((a, b) => b.timestamp - a.timestamp);
  } else if (currentSortOrder === 'oldest') {
    videos.sort((a, b) => a.timestamp - b.timestamp);
  } else if (currentSortOrder === 'name') {
    videos.sort((a, b) => a.prompt.localeCompare(b.prompt));
  }
  
  libraryGrid.innerHTML = ''; // Clear existing grid
  
  if (videos.length === 0) {
    libraryPlaceholder.classList.remove('hidden');
    libraryGrid.classList.add('hidden');
  } else {
    libraryPlaceholder.classList.add('hidden');
    libraryGrid.classList.remove('hidden');

    videos.forEach(videoRecord => {
        const card = document.createElement('div');
        card.className = 'library-card';
        const thumbnailUrl = URL.createObjectURL(videoRecord.thumbnailBlob);

        card.innerHTML = `
            <div class="library-card-thumbnail">
                <img src="${thumbnailUrl}" alt="Video thumbnail for prompt: ${videoRecord.prompt}">
                <button class="play-button" aria-label="Play video"></button>
            </div>
            <div class="library-card-info">
                <p class="library-card-prompt">${videoRecord.prompt}</p>
                <span class="library-card-date">${new Date(videoRecord.timestamp).toLocaleDateString()}</span>
            </div>
        `;

        card.querySelector('.play-button').addEventListener('click', () => {
            const videoUrl = URL.createObjectURL(videoRecord.videoBlob);
            // Simple playback: replace the main video player
            showView('generate');
            video.src = videoUrl;
            video.style.display = 'block';
            videoPlaceholder.classList.add('hidden');
            downloadButton.classList.remove('hidden');
            currentVideoURL = videoUrl;
            statusEl.textContent = `Now playing: ${videoRecord.prompt}`;
        });
        
        libraryGrid.appendChild(card);
    });
  }
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
  initDB();
  loadApiKey();
  showView('templates'); // Start on templates view
  if (!geminiApiKey) {
    openApiKeyModal('Please enter your Gemini API key to start.');
  }
});

navGenerate.addEventListener('click', () => showView('generate'));
navTemplates.addEventListener('click', () => showView('templates'));
navLibrary.addEventListener('click', () => showView('library'));

sortSelect.addEventListener('change', () => {
    currentSortOrder = sortSelect.value as 'newest' | 'oldest' | 'name';
    loadVideosFromLibrary();
});

textToVideoTab.addEventListener('click', () => {
  textToVideoTab.classList.add('active');
  imageToVideoTab.classList.remove('active');
  imageUploadContainer.classList.add('hidden');
  imageUploadDivider.classList.add('hidden');
  base64data = '';
  imgPreview.style.display = 'none';
  uploadInput.value = '';
});

imageToVideoTab.addEventListener('click', () => {
  imageToVideoTab.classList.add('active');
  textToVideoTab.classList.remove('active');
  imageUploadContainer.classList.remove('hidden');
  imageUploadDivider.classList.remove('hidden');
});

uploadInput.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files[0];
  if (file) {
    base64data = await blobToBase64(file);
    imgPreview.src = `data:${file.type};base64,${base64data}`;
    imgPreview.style.display = 'block';
  }
});

styleButtons.forEach((button) => {
    if (button.id === 'custom-prompt-button') return;
    button.addEventListener('click', () => {
        setActiveButton(styleButtons, button);
        selectedStylePrefix = (button as HTMLElement).dataset.style || '';
        customStyleValue = '';
    });
});
customPromptButton.addEventListener('click', openCustomPromptModal);

formatButtons.forEach((button) => {
  button.addEventListener('click', () => {
    setActiveButton(formatButtons, button);
    selectedAspectRatio = (button as HTMLElement).dataset.value;
  });
});

musicButtons.forEach((button) => {
  button.addEventListener('click', () => {
    setActiveButton(musicButtons, button);
    selectedMusicStyle = (button as HTMLElement).dataset.music || 'none';

    if (selectedMusicStyle !== 'none') {
        audioSwitch.checked = true;
        audioSwitch.disabled = true;
        audioToggle.classList.add('disabled');
    } else {
        audioSwitch.disabled = false;
        audioToggle.classList.remove('disabled');
    }
  });
});

templateCards.forEach((card) => {
  card.addEventListener('click', () => {
    const style = (card as HTMLElement).dataset.style;
    const music = (card as HTMLElement).dataset.music || 'none';

    // Set video style
    const styleButton = document.querySelector(
      `.style-option[data-style="${style}"]`
    );
    if (styleButton) {
      setActiveButton(styleButtons, styleButton);
      selectedStylePrefix = style;
      customStyleValue = '';
    } else {
      // Fallback to custom if no direct button match
      setActiveButton(styleButtons, customPromptButton);
      selectedStylePrefix = '';
      customStyleValue = style;
    }
    
    // Set background music
    selectedMusicStyle = music;
    const musicButton = document.querySelector(
        `.music-option[data-music="${music}"]`
    );
    if (musicButton) {
        setActiveButton(musicButtons, musicButton);
    }
    
    // Update audio toggle state based on music selection
    if (selectedMusicStyle !== 'none') {
        audioSwitch.checked = true;
        audioSwitch.disabled = true;
        audioToggle.classList.add('disabled');
    } else {
        audioSwitch.disabled = false;
        audioToggle.classList.remove('disabled');
    }

    showView('generate');
  });
});


generateButton.addEventListener('click', async () => {
  if (!geminiApiKey) {
    openApiKeyModal('Please enter your Gemini API key to generate a video.');
    return;
  }
  const prompt = promptEl.value.trim();
  if (!prompt && !base64data) {
    statusEl.textContent = 'Please enter a video description or upload an image.';
    return;
  }

  // Disable UI
  generateButton.classList.add('loading');
  allInputs.forEach((el: any) => (el.disabled = true));

  // Reset UI
  statusEl.textContent = '';
  video.style.display = 'none';
  downloadButton.classList.add('hidden');
  videoPlaceholder.classList.remove('hidden');
  placeholderInitialState.classList.add('hidden');
  placeholderGeneratingState.classList.remove('hidden');
  progressBar.style.width = '0%';
  progressPercent.textContent = '0%';
  progressStage.textContent = 'Initializing...';


  try {
    const finalStyle = customPromptButton.classList.contains('active') ? customStyleValue : selectedStylePrefix;
    let basePrompt = finalStyle ? `${finalStyle}, ${prompt}` : prompt;

    const musicPromptMap: Record<string, string> = {
        cinematic: 'with a dramatic, cinematic musical score',
        ambient: 'with a calm, ambient soundtrack',
        electronic: 'with an upbeat electronic music track',
        upbeat: 'with an uplifting and upbeat music score',
    };

    if (selectedMusicStyle !== 'none' && musicPromptMap[selectedMusicStyle]) {
        const musicDescription = musicPromptMap[selectedMusicStyle];
        basePrompt = basePrompt ? `${basePrompt}, ${musicDescription}` : musicDescription;
    }

    const params: VideoParams = {
      aspectRatio: selectedAspectRatio,
      generateAudio: selectedMusicStyle !== 'none' || audioSwitch.checked,
    };

    const videoBlob = await generateContent(
      basePrompt,
      base64data,
      params,
      (percent) => {
        progressBar.style.width = `${percent}%`;
        progressPercent.textContent = `${percent.toFixed(0)}%`;

        if (percent < 10) {
          progressStage.textContent = 'Analyzing prompt...';
        } else if (percent < 50) {
          progressStage.textContent = 'Generating keyframes...';
        } else if (percent < 90) {
          progressStage.textContent = 'Rendering video...';
        } else {
          progressStage.textContent = 'Finalizing...';
        }
      }
    );

    currentVideoURL = URL.createObjectURL(videoBlob);
    video.src = currentVideoURL;

    video.addEventListener(
      'loadeddata',
      async () => {
        video.style.display = 'block';
        videoPlaceholder.classList.add('hidden');
        downloadButton.classList.remove('hidden');
        statusEl.textContent = 'Video generated successfully.';

        // Generate thumbnail and save to library
        const thumbnailBlob = await createThumbnail(video);
        const videoRecord: VideoRecord = {
          prompt: basePrompt,
          videoBlob,
          thumbnailBlob,
          timestamp: Date.now(),
        };
        await addVideoToLibrary(videoRecord);
      },
      { once: true }
    );
  } catch (err) {
    let friendlyMessage = 'An unknown error occurred. Please try again.';
    const rawMessage = (err as Error).message || '';
    
    if (rawMessage.includes('quota')) {
        friendlyMessage = 'You have exceeded your API quota. Please check your plan and billing details.';
    } else {
         try {
            const errorJson = JSON.parse(rawMessage);
            if (errorJson.error && errorJson.error.message) {
                friendlyMessage = errorJson.error.message;
            }
        } catch (e) {
            friendlyMessage = rawMessage;
        }
    }
    
    statusEl.textContent = `Error: ${friendlyMessage}`;
    statusEl.classList.add('error-message');
    placeholderInitialState.classList.remove('hidden');
    placeholderGeneratingState.classList.add('hidden');
    
    if (friendlyMessage.toLowerCase().includes('api key')) {
        openApiKeyModal(friendlyMessage);
    }
  } finally {
    // Re-enable UI, respecting the music style lock
    generateButton.classList.remove('loading');
    allInputs.forEach((el: any) => {
        if (el.id !== 'audio-switch' || selectedMusicStyle === 'none') {
             el.disabled = false
        }
    });
  }
});

downloadButton.addEventListener('click', () => {
  if (currentVideoURL) {
    downloadFile(currentVideoURL, 'ai-video.mp4');
  }
});

// API Key Modal Listeners
settingsButton.addEventListener('click', () => openApiKeyModal());
apiKeyModal.addEventListener('click', (e) => {
  if (e.target === apiKeyModal) closeApiKeyModal();
});
modalContent.addEventListener('click', (e) => e.stopPropagation());
saveKeyButton.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  if (key) {
    localStorage.setItem(API_KEY_STORAGE_KEY, key);
    geminiApiKey = key;
    apiErrorEl.textContent = '';
    closeApiKeyModal();
  } else {
    apiErrorEl.textContent = 'Please enter a valid API key.';
  }
});
apiKeyInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveKeyButton.click();
});

// Custom Prompt Modal Listeners
saveCustomPromptButton.addEventListener('click', () => {
    const newStyle = customPromptInput.value.trim();
    if (newStyle) {
        customStyleValue = newStyle;
        setActiveButton(styleButtons, customPromptButton);
    }
    closeCustomPromptModal();
});
cancelCustomPromptButton.addEventListener('click', closeCustomPromptModal);
customPromptModal.addEventListener('click', (e) => {
  if (e.target === customPromptModal) closeCustomPromptModal();
});
customPromptModal.querySelector('.modal-content').addEventListener('click', e => e.stopPropagation());
