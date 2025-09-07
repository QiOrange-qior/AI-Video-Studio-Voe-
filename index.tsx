/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
// Fix: Add DOM library reference to resolve TypeScript errors with browser APIs.
/// <reference lib="dom" />

import { GoogleGenAI } from '@google/genai';
// Fix: Removed static FFmpeg imports to prevent app load failures. They are now imported dynamically.

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

// Fix: Removed API key modal and related logic to adhere to the guideline of using process.env.API_KEY exclusively.

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
    if (libraryView && !libraryView.classList.contains('hidden')) {
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

function formatTime(timeInSeconds: number): string {
  const minutes = Math.floor(timeInSeconds / 60);
  const seconds = Math.floor(timeInSeconds % 60);
  const milliseconds = Math.round((timeInSeconds - Math.floor(timeInSeconds)) * 1000);
  return `${minutes.toString().padStart(2, '0')}:${seconds
    .toString()
    .padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
}

function formatDisplayTime(timeInSeconds: number): string {
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}


async function generateContent(
  prompt: string,
  imageBytes: string,
  params: VideoParams,
  onProgress: (percent: number) => void
): Promise<Blob> {
  // Fix: Use process.env.API_KEY as per the guidelines. Assume it is available.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const config: any = {
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
  // Fix: Use process.env.API_KEY as per the guidelines.
  const url = `${firstVideo.video.uri}&key=${process.env.API_KEY}`;
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
let generateView: HTMLDivElement,
    templatesView: HTMLDivElement,
    libraryView: HTMLDivElement,
    navGenerate: HTMLDivElement,
    navTemplates: HTMLDivElement,
    navLibrary: HTMLDivElement,
    promptEl: HTMLTextAreaElement,
    statusEl: HTMLParagraphElement,
    video: HTMLVideoElement,
    videoPreviewContainer: HTMLDivElement,
    videoPlaceholder: HTMLDivElement,
    placeholderInitialState: HTMLDivElement,
    placeholderGeneratingState: HTMLDivElement,
    progressBar: HTMLDivElement,
    progressPercent: HTMLParagraphElement,
    progressStage: HTMLParagraphElement,
    generateButton: HTMLButtonElement,
    generateButtonLabel: HTMLSpanElement,
    downloadButton: HTMLButtonElement,
    trimButton: HTMLButtonElement,
    textToVideoTab: HTMLDivElement,
    imageToVideoTab: HTMLDivElement,
    imageUploadContainer: HTMLDivElement,
    imageUploadDivider: HTMLHRElement,
    uploadInput: HTMLInputElement,
    imgPreview: HTMLImageElement,
    // Fix: Changed NodeListOf<Element> to NodeListOf<HTMLElement> to resolve type error.
    styleButtons: NodeListOf<HTMLElement>,
    customPromptButton: HTMLDivElement,
    // Fix: Changed NodeListOf<Element> to NodeListOf<HTMLElement> to resolve type error.
    formatButtons: NodeListOf<HTMLElement>,
    // Fix: Changed NodeListOf<Element> to NodeListOf<HTMLElement> to resolve type error.
    musicButtons: NodeListOf<HTMLElement>,
    audioToggle: HTMLDivElement,
    audioSwitch: HTMLInputElement,
    trimmerUI: HTMLDivElement,
    timeline: HTMLDivElement,
    timelineRange: HTMLDivElement,
    startHandle: HTMLDivElement,
    endHandle: HTMLDivElement,
    trimTimeStartEl: HTMLSpanElement,
    trimTimeEndEl: HTMLSpanElement,
    trimTimeTotalEl: HTMLSpanElement,
    trimCancelButton: HTMLButtonElement,
    trimApplyButton: HTMLButtonElement,
    templateCards: NodeListOf<Element>,
    libraryGrid: HTMLDivElement,
    libraryPlaceholder: HTMLDivElement,
    sortSelect: HTMLSelectElement,
    customPromptModal: HTMLDivElement,
    customPromptInput: HTMLTextAreaElement,
    saveCustomPromptButton: HTMLButtonElement,
    cancelCustomPromptButton: HTMLButtonElement,
    allInputs: HTMLElement[];

function initializeDOMElements() {
    generateView = document.querySelector('#generate-view') as HTMLDivElement;
    templatesView = document.querySelector('#templates-view') as HTMLDivElement;
    libraryView = document.querySelector('#library-view') as HTMLDivElement;
    navGenerate = document.querySelector('#nav-generate') as HTMLDivElement;
    navTemplates = document.querySelector('#nav-templates') as HTMLDivElement;
    navLibrary = document.querySelector('#nav-library') as HTMLDivElement;
    promptEl = document.querySelector('#prompt-input') as HTMLTextAreaElement;
    statusEl = document.querySelector('#status') as HTMLParagraphElement;
    video = document.querySelector('#video') as HTMLVideoElement;
    videoPreviewContainer = document.querySelector('#video-preview-container') as HTMLDivElement;
    videoPlaceholder = document.querySelector('#video-placeholder') as HTMLDivElement;
    placeholderInitialState = document.querySelector('#placeholder-initial-state') as HTMLDivElement;
    placeholderGeneratingState = document.querySelector('#placeholder-generating-state') as HTMLDivElement;
    progressBar = document.querySelector('#progress-bar') as HTMLDivElement;
    progressPercent = document.querySelector('#progress-percent') as HTMLParagraphElement;
    progressStage = document.querySelector('#progress-stage') as HTMLParagraphElement;
    generateButton = document.querySelector('#generate-button') as HTMLButtonElement;
    generateButtonLabel = generateButton?.querySelector('.button-label') as HTMLSpanElement;
    downloadButton = document.querySelector('#download-button') as HTMLButtonElement;
    trimButton = document.querySelector('#trim-button') as HTMLButtonElement;
    textToVideoTab = document.querySelector('#text-to-video-tab') as HTMLDivElement;
    imageToVideoTab = document.querySelector('#image-to-video-tab') as HTMLDivElement;
    imageUploadContainer = document.querySelector('#image-upload-container') as HTMLDivElement;
    imageUploadDivider = document.querySelector('#image-upload-divider') as HTMLHRElement;
    uploadInput = document.querySelector('#file-input') as HTMLInputElement;
    imgPreview = document.querySelector('#img-preview') as HTMLImageElement;
    if (imgPreview) imgPreview.style.display = 'none';
    // Fix: Used querySelectorAll<HTMLElement> to get a more specific type, resolving the assignment error for allInputs.
    styleButtons = document.querySelectorAll<HTMLElement>('.style-option');
    customPromptButton = document.querySelector('#custom-prompt-button') as HTMLDivElement;
    // Fix: Used querySelectorAll<HTMLElement> to get a more specific type, resolving the assignment error for allInputs.
    formatButtons = document.querySelectorAll<HTMLElement>('.format-option');
    // Fix: Used querySelectorAll<HTMLElement> to get a more specific type, resolving the assignment error for allInputs.
    musicButtons = document.querySelectorAll<HTMLElement>('.music-option');
    audioToggle = document.querySelector('.audio-toggle') as HTMLDivElement;
    audioSwitch = document.querySelector('#audio-switch') as HTMLInputElement;
    trimmerUI = document.querySelector('#trimmer-ui') as HTMLDivElement;
    timeline = document.querySelector('#timeline') as HTMLDivElement;
    timelineRange = document.querySelector('#timeline-range') as HTMLDivElement;
    startHandle = document.querySelector('#timeline-handle-start') as HTMLDivElement;
    endHandle = document.querySelector('#timeline-handle-end') as HTMLDivElement;
    trimTimeStartEl = document.querySelector('#trim-time-start') as HTMLSpanElement;
    trimTimeEndEl = document.querySelector('#trim-time-end') as HTMLSpanElement;
    trimTimeTotalEl = document.querySelector('#trim-time-total') as HTMLSpanElement;
    trimCancelButton = document.querySelector('#trim-cancel-button') as HTMLButtonElement;
    trimApplyButton = document.querySelector('#trim-apply-button') as HTMLButtonElement;
    templateCards = document.querySelectorAll('.template-card');
    libraryGrid = document.querySelector('#library-grid') as HTMLDivElement;
    libraryPlaceholder = document.querySelector('.library-placeholder') as HTMLDivElement;
    sortSelect = document.querySelector('#sort-select') as HTMLSelectElement;
    customPromptModal = document.querySelector('#custom-prompt-modal') as HTMLDivElement;
    customPromptInput = document.querySelector('#custom-prompt-input') as HTMLTextAreaElement;
    saveCustomPromptButton = document.querySelector('#save-custom-prompt-button') as HTMLButtonElement;
    cancelCustomPromptButton = document.querySelector('#cancel-custom-prompt-button') as HTMLButtonElement;
    
    // Fix: Added generic <HTMLElement> to querySelectorAll to ensure type compatibility with allInputs array.
    allInputs = [
      promptEl,
      generateButton,
      uploadInput,
      audioSwitch,
      navGenerate,
      navTemplates,
      navLibrary,
      textToVideoTab,
      imageToVideoTab,
      ...Array.from(styleButtons),
      ...Array.from(formatButtons),
      ...Array.from(musicButtons),
    ].filter(Boolean); // Filter out null/undefined elements
}

let base64data = '';
let currentVideoURL = '';
let currentVideoBlob: Blob | null = null;
let originalVideoBlob: Blob | null = null;
let selectedStylePrefix = '';
let customStyleValue = '';
let selectedAspectRatio = '16:9';
let selectedMusicStyle = 'none';
let currentSortOrder: 'newest' | 'oldest' | 'name' = 'newest';
let ffmpeg: any | null = null;
let trimmerInitialized = false;


// Fix: Removed API key modal functions as per guidelines.

// --- Custom Prompt Modal ---
function openCustomPromptModal() {
  if (!customPromptModal || !customPromptInput) return;
  customPromptInput.value = customStyleValue;
  customPromptModal.classList.remove('hidden');
}
function closeCustomPromptModal() {
  if (customPromptModal) customPromptModal.classList.add('hidden');
}


// --- Helper Functions ---
function setActiveButton(buttons: NodeListOf<Element>, selectedButton: Element) {
  buttons.forEach((btn) => btn.classList.remove('active'));
  selectedButton.classList.add('active');
}

function showView(viewId: 'generate' | 'templates' | 'library') {
  if (!generateView || !templatesView || !libraryView || !navGenerate || !navTemplates || !navLibrary) return;

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
  
  if (!libraryGrid || !libraryPlaceholder) return;
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

        const playButton = card.querySelector('.play-button');
        if (playButton) {
          playButton.addEventListener('click', () => {
              currentVideoBlob = videoRecord.videoBlob;
              const videoUrl = URL.createObjectURL(videoRecord.videoBlob);
              // Simple playback: replace the main video player
              showView('generate');
              if (video && videoPlaceholder && downloadButton && trimButton && statusEl) {
                  video.src = videoUrl;
                  video.style.display = 'block';
                  videoPlaceholder.classList.add('hidden');
                  downloadButton.classList.remove('hidden');
                  trimButton.classList.remove('hidden');
                  currentVideoURL = videoUrl;
                  statusEl.textContent = `Now playing: ${videoRecord.prompt}`;
              }
          });
        }

        libraryGrid.appendChild(card);
    });
  }
}

// --- Trimmer Functions ---
async function loadFFmpeg() {
  if (ffmpeg) return;
  if (statusEl) statusEl.textContent = 'Loading trimmer...';
  
  try {
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const { toBlobURL } = await import('@ffmpeg/util');

    ffmpeg = new FFmpeg();
    const baseURL = "https://esm.sh/@ffmpeg/core@0.12.10/dist/esm"
    await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    if (statusEl) statusEl.textContent = '';
  } catch (error) {
      console.error("Failed to load FFmpeg:", error);
      if (statusEl) statusEl.textContent = 'Failed to load trimmer components.';
  }
}

function updateTimelineUI(startTime: number, endTime: number, duration: number) {
    if (!startHandle || !endHandle || !timelineRange || !trimTimeStartEl || !trimTimeEndEl) return;
    const startPercent = (startTime / duration) * 100;
    const endPercent = (endTime / duration) * 100;

    startHandle.style.left = `${startPercent}%`;
    endHandle.style.left = `${endPercent}%`;
    timelineRange.style.left = `${startPercent}%`;
    timelineRange.style.right = `${100 - endPercent}%`;

    trimTimeStartEl.textContent = formatDisplayTime(startTime);
    trimTimeEndEl.textContent = formatDisplayTime(endTime);
}

function handleTrimPreview() {
    if (!video || !startHandle || !endHandle) return;
    const duration = video.duration;
    if (!duration || video.paused) return;

    const startTime = parseFloat(startHandle.style.left) / 100 * duration;
    const endTime = parseFloat(endHandle.style.left) / 100 * duration;

    // Loop if playback goes past the end of the selection
    if (video.currentTime >= endTime) {
        video.currentTime = startTime;
    }
}

function onPreviewPlay() {
    if (!video || !startHandle || !endHandle) return;
    const duration = video.duration;
    if (!duration) return;

    const startTime = parseFloat(startHandle.style.left) / 100 * duration;
    const endTime = parseFloat(endHandle.style.left) / 100 * duration;

    // If playback starts from outside the selected range, move it to the start
    if (video.currentTime < startTime || video.currentTime >= endTime) {
        video.currentTime = startTime;
    }
}

function dragHandler(handle: HTMLElement, isStartHandle: boolean) {
    handle.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (video && video.paused) {
          video.play();
        }

        if (!timeline || !video || !startHandle || !endHandle) return;
        const timelineRect = timeline.getBoundingClientRect();

        const onPointerMove = (moveEvent: PointerEvent) => {
            let newX = moveEvent.clientX - timelineRect.left;
            const percent = Math.max(0, Math.min(100, (newX / timelineRect.width) * 100));

            const duration = video.duration;
            let newTime = (percent / 100) * duration;

            let startTime = parseFloat(startHandle.style.left) / 100 * duration;
            let endTime = parseFloat(endHandle.style.left) / 100 * duration;

            if (isStartHandle) {
                if (newTime >= endTime) newTime = endTime;
                startTime = newTime;
            } else {
                if (newTime <= startTime) newTime = startTime;
                endTime = newTime;
            }

            video.currentTime = newTime;
            updateTimelineUI(startTime, endTime, duration);
        };

        const onPointerUp = () => {
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', onPointerUp);
        };

        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
    });
}

function initializeTrimmer() {
    if (trimmerInitialized || !startHandle || !endHandle) return;
    dragHandler(startHandle, true);
    dragHandler(endHandle, false);
    trimmerInitialized = true;
}


// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
  initializeDOMElements();
  initDB();
  // Fix: Removed API key loading and modal logic as per guidelines.
  showView('templates'); // Start on templates view

  if (navGenerate) navGenerate.addEventListener('click', () => showView('generate'));
  if (navTemplates) navTemplates.addEventListener('click', () => showView('templates'));
  if (navLibrary) navLibrary.addEventListener('click', () => showView('library'));

  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
        currentSortOrder = sortSelect.value as 'newest' | 'oldest' | 'name';
        loadVideosFromLibrary();
    });
  }

  if (textToVideoTab) {
    textToVideoTab.addEventListener('click', () => {
      if (imageToVideoTab && imageUploadContainer && imageUploadDivider && imgPreview && uploadInput) {
        textToVideoTab.classList.add('active');
        imageToVideoTab.classList.remove('active');
        imageUploadContainer.classList.add('hidden');
        imageUploadDivider.classList.add('hidden');
        base64data = '';
        imgPreview.style.display = 'none';
        uploadInput.value = '';
      }
    });
  }

  if (imageToVideoTab) {
    imageToVideoTab.addEventListener('click', () => {
      if (textToVideoTab && imageUploadContainer && imageUploadDivider) {
        imageToVideoTab.classList.add('active');
        textToVideoTab.classList.remove('active');
        imageUploadContainer.classList.remove('hidden');
        imageUploadDivider.classList.remove('hidden');
      }
    });
  }

  if (uploadInput) {
    uploadInput.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file && imgPreview) {
        base64data = await blobToBase64(file);
        imgPreview.src = `data:${file.type};base64,${base64data}`;
        imgPreview.style.display = 'block';
      }
    });
  }

  if (styleButtons) {
    styleButtons.forEach((button) => {
        if (button.id === 'custom-prompt-button') return;
        button.addEventListener('click', () => {
            setActiveButton(styleButtons, button);
            selectedStylePrefix = (button as HTMLElement).dataset.style || '';
            customStyleValue = '';
        });
    });
  }
  
  if (customPromptButton) customPromptButton.addEventListener('click', openCustomPromptModal);

  if (formatButtons) {
    formatButtons.forEach((button) => {
      button.addEventListener('click', () => {
        setActiveButton(formatButtons, button);
        selectedAspectRatio = (button as HTMLElement).dataset.value;
      });
    });
  }

  if (musicButtons) {
    musicButtons.forEach((button) => {
      button.addEventListener('click', () => {
        setActiveButton(musicButtons, button);
        selectedMusicStyle = (button as HTMLElement).dataset.music || 'none';

        if (audioSwitch && audioToggle) {
          if (selectedMusicStyle !== 'none') {
              audioSwitch.checked = true;
              audioSwitch.disabled = true;
              audioToggle.classList.add('disabled');
          } else {
              audioSwitch.disabled = false;
              audioToggle.classList.remove('disabled');
          }
        }
      });
    });
  }
  
  if (templateCards) {
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
        } else if (customPromptButton) {
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
        if (audioSwitch && audioToggle) {
          if (selectedMusicStyle !== 'none') {
              audioSwitch.checked = true;
              audioSwitch.disabled = true;
              audioToggle.classList.add('disabled');
          } else {
              audioSwitch.disabled = false;
              audioToggle.classList.remove('disabled');
          }
        }
        showView('generate');
      });
    });
  }

  if (generateButton) {
    generateButton.addEventListener('click', async () => {
      // Fix: Removed API key check as per guidelines.
      const prompt = promptEl?.value.trim();
      if ((!prompt && !base64data) || !statusEl) {
        if (statusEl) statusEl.textContent = 'Please enter a video description or upload an image.';
        return;
      }

      // Disable UI
      generateButton.classList.add('loading');
      allInputs.forEach((el) => {
        if (el instanceof HTMLButtonElement || el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
            el.disabled = true;
        } else {
            el.classList.add('disabled');
            el.setAttribute('tabindex', '-1');
        }
      });

      // Reset UI
      statusEl.textContent = '';
      if(video) video.style.display = 'none';
      if(downloadButton) downloadButton.classList.add('hidden');
      if(trimButton) trimButton.classList.add('hidden');
      if(trimmerUI) trimmerUI.classList.add('hidden');
      if(videoPlaceholder) videoPlaceholder.classList.remove('hidden');
      if(placeholderInitialState) placeholderInitialState.classList.add('hidden');
      if(placeholderGeneratingState) placeholderGeneratingState.classList.remove('hidden');
      if(progressBar) progressBar.style.width = '0%';
      if(progressPercent) progressPercent.textContent = '0%';
      if(progressStage) progressStage.textContent = 'Initializing...';


      try {
        const finalStyle = customPromptButton?.classList.contains('active') ? customStyleValue : selectedStylePrefix;
        let basePrompt = finalStyle && prompt ? `${finalStyle}, ${prompt}` : prompt || finalStyle;


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
          generateAudio: selectedMusicStyle !== 'none' || (audioSwitch?.checked ?? false),
        };

        const generatedBlob = await generateContent(
          basePrompt,
          base64data,
          params,
          (percent) => {
            if (progressBar) progressBar.style.width = `${percent}%`;
            if (progressPercent) progressPercent.textContent = `${percent.toFixed(0)}%`;

            if (progressStage) {
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
          }
        );

        currentVideoBlob = generatedBlob;
        currentVideoURL = URL.createObjectURL(currentVideoBlob);
        if (video) video.src = currentVideoURL;

        if (video) {
          video.addEventListener(
            'loadeddata',
            async () => {
              video.style.display = 'block';
              if (videoPlaceholder) videoPlaceholder.classList.add('hidden');
              if (downloadButton) downloadButton.classList.remove('hidden');
              if (trimButton) trimButton.classList.remove('hidden');
              if (statusEl) statusEl.textContent = 'Video generated successfully.';

              // Generate thumbnail and save to library
              if (currentVideoBlob) {
                const thumbnailBlob = await createThumbnail(video);
                const videoRecord: VideoRecord = {
                  prompt: basePrompt,
                  videoBlob: currentVideoBlob,
                  thumbnailBlob,
                  timestamp: Date.now(),
                };
                await addVideoToLibrary(videoRecord);
              }
            },
            { once: true }
          );
        }
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
        
        if (statusEl) {
            statusEl.textContent = `Error: ${friendlyMessage}`;
            statusEl.classList.add('error-message');
        }
        if (placeholderInitialState) placeholderInitialState.classList.remove('hidden');
        if (placeholderGeneratingState) placeholderGeneratingState.classList.add('hidden');

      } finally {
        // Re-enable UI, respecting the music style lock
        if (generateButton) generateButton.classList.remove('loading');
        allInputs.forEach((el) => {
            const isFormControl = el instanceof HTMLButtonElement || el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;

            // Don't re-enable the audio switch if a music style is selected
            if (el.id === 'audio-switch' && selectedMusicStyle !== 'none') {
                return; 
            }

            if (isFormControl) {
                (el as HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement).disabled = false;
            } else {
                el.classList.remove('disabled');
                el.setAttribute('tabindex', '0');
            }
        });
      }
    });
  }

  if (downloadButton) {
    downloadButton.addEventListener('click', () => {
      if (currentVideoURL) {
        downloadFile(currentVideoURL, 'ai-video.mp4');
      }
    });
  }
  
  if (trimButton) {
    trimButton.addEventListener('click', async () => {
        if (!currentVideoBlob || !trimmerUI || !video || !trimTimeTotalEl) return;
        trimmerUI.classList.remove('hidden');
        originalVideoBlob = currentVideoBlob;

        await loadFFmpeg();
        if (!ffmpeg) return; // Stop if FFmpeg failed to load

        const duration = video.duration;
        trimTimeTotalEl.textContent = `/ ${formatDisplayTime(duration)}`;
        updateTimelineUI(0, duration, duration);

        video.addEventListener('timeupdate', handleTrimPreview);
        video.addEventListener('play', onPreviewPlay);

        initializeTrimmer();
    });
  }

  if (trimCancelButton) {
    trimCancelButton.addEventListener('click', () => {
        if (!video || !trimmerUI) return;
        video.removeEventListener('timeupdate', handleTrimPreview);
        video.removeEventListener('play', onPreviewPlay);
        if (originalVideoBlob) {
            currentVideoBlob = originalVideoBlob;
            currentVideoURL = URL.createObjectURL(currentVideoBlob);
            video.src = currentVideoURL;
            originalVideoBlob = null;
        }
        trimmerUI.classList.add('hidden');
    });
  }
  
  if (trimApplyButton) {
    trimApplyButton.addEventListener('click', async () => {
        if (!video || !statusEl) return;
        video.removeEventListener('timeupdate', handleTrimPreview);
        video.removeEventListener('play', onPreviewPlay);

        if (!ffmpeg || !originalVideoBlob) return;

        const startTime = parseFloat(startHandle.style.left) / 100 * video.duration;
        const endTime = parseFloat(endHandle.style.left) / 100 * video.duration;

        if (endTime <= startTime) {
            statusEl.textContent = 'End time must be after start time.';
            return;
        }

        trimApplyButton.classList.add('loading');
        trimApplyButton.disabled = true;
        statusEl.textContent = 'Trimming video...';

        try {
            const { fetchFile } = await import('@ffmpeg/util');
            await ffmpeg.writeFile('input.mp4', await fetchFile(originalVideoBlob));
            await ffmpeg.exec([
                '-i', 'input.mp4',
                '-ss', formatTime(startTime),
                '-to', formatTime(endTime),
                '-c', 'copy', // Fast trimming without re-encoding
                'output.mp4'
            ]);

            const data = await ffmpeg.readFile('output.mp4');
            const trimmedBlob = new Blob([(data as Uint8Array).buffer], { type: 'video/mp4' });

            currentVideoBlob = trimmedBlob;
            currentVideoURL = URL.createObjectURL(currentVideoBlob);
            video.src = currentVideoURL;

            if (trimmerUI) trimmerUI.classList.add('hidden');
            statusEl.textContent = 'Trim applied successfully.';
        } catch (error) {
            console.error('FFmpeg error:', error);
            statusEl.textContent = 'Error trimming video.';
        } finally {
            trimApplyButton.classList.remove('loading');
            trimApplyButton.disabled = false;
        }
    });
  }

  // Custom Prompt Modal Listeners
  if (saveCustomPromptButton) {
    saveCustomPromptButton.addEventListener('click', () => {
      if (customPromptInput) {
        const newStyle = customPromptInput.value.trim();
        if (newStyle && customPromptButton) {
          customStyleValue = newStyle;
          setActiveButton(styleButtons, customPromptButton);
        }
      }
      closeCustomPromptModal();
    });
  }
  if (cancelCustomPromptButton) {
    cancelCustomPromptButton.addEventListener('click', closeCustomPromptModal);
  }
  if (customPromptModal) {
    customPromptModal.addEventListener('click', (e) => {
      if (e.target === customPromptModal) closeCustomPromptModal();
    });
    const modalContent = customPromptModal.querySelector('.modal-content');
    if (modalContent) {
      modalContent.addEventListener('click', (e) => e.stopPropagation());
    }
  }

  // Add keyboard accessibility to div 'buttons'
  const clickableDivs = document.querySelectorAll<HTMLDivElement>('#nav-generate, #nav-templates, #nav-library, .tab-button, .template-card, .style-option, .format-option, .music-option');
  clickableDivs.forEach(div => {
      div.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              div.click();
          }
      });
  });
});