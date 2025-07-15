const { createApp } = Vue;
import { FFmpeg } from './node_modules/@ffmpeg/ffmpeg/dist/esm/index.js';
import { fetchFile, toBlobURL } from './node_modules/@ffmpeg/util/dist/esm/index.js';
import { String_random } from './node_modules/string_random.js/lib/String_random.js';

const timeout = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function loadFFmpeg() {
	if (loadFFmpeg.ffmpeg) {
		return loadFFmpeg.ffmpeg;
	}

	const ffmpeg = new FFmpeg();
	if (false && window.crossOriginIsolated) {
		// chrome だと動かない
		const baseURL = 'https://unpkg.com/@ffmpeg/core-mt@0.12.10/dist/esm';
		console.log('loadFFmpeg', baseURL);
		await ffmpeg.load({
			coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
			wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm",),
			workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript'),
		});
	} else {
		const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm';
		console.log('loadFFmpeg', baseURL);
		await ffmpeg.load({
			coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
			wasmURL: await toBlobURL( `${baseURL}/ffmpeg-core.wasm`, "application/wasm",),
		});
	}
	console.log('ffmpeg loaded');
	loadFFmpeg.ffmpeg = ffmpeg;
	return ffmpeg;
}


function getRandomText() {
    const patterns = [
        /セミの鳴き声です: ( (ミー?ン)+|(ツクツク|ホーシ)+|(ジー?)+)/,
        /(ルイズ！)+((ルイズ！?)+|(ぅ*う*わぁ+あ+ん！+)|あ+[あ…ぁ]+|[うぅ]+)+/,
        /(Linux|Ruby|Perl|JavaScript|Java|Rust|golang|PHP|Haskell|Lisp)完全に理解した/,
        /([0-9]|1[0-2])月から本気出す/,
    ];
    
    const selectedPattern = patterns[Math.floor(Math.random() * patterns.length)];
    
    return String_random(selectedPattern.source);
}

createApp({
    data() {
        return {
            options: {
                text: getRandomText(),
                selectedFont: 'Noto+Sans+JP',
                fontWeight: '900',
                fontStyle: 'normal',
                textColor: '#ffffff',
                backgroundColor: '#000000',
                fontSize: 640,
                videoDuration: 3,
                format: 'mp4', // 'mp4' or 'gif'
            },
            
            // Internal state
            videoBlob: null,
            statusText: '準備完了',
            progress: 0,
            
            // Canvas related
            canvas: null,
            ctx: null,
            animationId: null,
            scrollPosition: 0,
            
            // FFmpeg recording related
            isGeneratingVideo: false,
            frames: [],
            totalFrames: 0,
            currentFrame: 0,
            logs: [],
            ffmpegProgress: 0,
            
            // Internal state
            scrollSpeed: 0,
            
            // Font loading cache
            loadingFonts: new Map(),
        }
    },
    
    computed: {
        progressText() {
            if (this.isGeneratingVideo) {
                if (this.totalFrames > 0 && this.currentFrame < this.totalFrames) {
                    return `フレーム生成: ${Math.round((this.currentFrame / this.totalFrames) * 100)}%`;
                } else if (this.ffmpegProgress > 0) {
                    return `${this.options.format}変換: ${Math.round(this.ffmpegProgress)}%`;
                }
            }
            return '';
        }
    },
    
    mounted() {
        this.canvas = this.$refs.canvas;
        this.ctx = this.canvas.getContext('2d');
        
        // URLハッシュから設定を復元
        this.loadOptionsFromHash();
        
        this.loadFont();
        this.startAnimation();
    },
    
    watch: {
        options: {
            handler() {
                this.updateHashFromOptions();
            },
            deep: true
        }
    },
    
    beforeUnmount() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
    },
    
    methods: {
        generateRandomText() {
            this.options.text = getRandomText();
            this.updateCanvas();
        },

        async loadFont() {
            if (this.options.selectedFont === 'Arial') {
                this.updateCanvas();
                return;
            }
            
            const fontName = this.options.selectedFont.replace(/\+/g, ' ');
            const fontSpec = `${this.options.fontStyle} ${this.options.fontWeight} ${this.options.fontSize}px "${fontName}"`;
            
            // フォントが既に読み込まれているかチェック
            if (document.fonts.check(fontSpec)) {
                console.log(`Font already loaded: ${fontSpec}`);
                this.updateCanvas();
                return;
            }
            
            // 同じフォントの読み込みが既に進行中かチェック
            const fontKey = `${this.options.selectedFont}-${this.options.fontWeight}-${this.options.fontStyle}`;
            if (this.loadingFonts.has(fontKey)) {
                console.log(`Font loading already in progress: ${fontKey}`);
                await this.loadingFonts.get(fontKey);
                this.updateCanvas();
                return;
            }
            
            const loadPromise = this.loadFontInternal(fontSpec);
            this.loadingFonts.set(fontKey, loadPromise);
            
            try {
                await loadPromise;
                this.updateCanvas();
            } finally {
                // 読み込み完了後にフラグを削除
                this.loadingFonts.delete(fontKey);
            }
        },
        
        async loadFontInternal(fontSpec) {
            // Google Fonts CSS を読み込む
            const link = document.createElement('link');
            link.href = `https://fonts.googleapis.com/css2?family=${this.options.selectedFont}:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900&display=swap`;
            link.rel = 'stylesheet';
            link.dataset.fontFamily = this.options.selectedFont;
            
            // 既存の同じフォントのリンクを削除
            const existingLinks = document.querySelectorAll(`link[data-font-family="${this.options.selectedFont}"]`);
            existingLinks.forEach(link => link.remove());
            
            document.head.appendChild(link);
            
            try {
                // 特定のフォントサイズとウェイトで読み込み完了を待つ
                await document.fonts.load(fontSpec);
                console.log(`Font loaded successfully: ${fontSpec}`);
            } catch (error) {
                console.warn('Font loading failed, using fallback:', error);
                // エラーが発生してもフォールバック処理を継続
                throw error;
            }
        },
        
        updateCanvas() {
            // Simply trigger a re-render since animation loop handles the drawing
            this.renderScrollingText();
        },
        
        renderScrollingText() {
            const centerY = this.canvas.height / 2;
            const textWidth = this.ctx.measureText(this.options.text).width;
            const startX = this.canvas.width + this.scrollPosition;
            
            // Clear and redraw background
            this.ctx.fillStyle = this.options.backgroundColor;
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            
            // Draw text
            this.ctx.font = this.getFontString();
            this.ctx.fillStyle = this.options.textColor;
            this.ctx.textAlign = 'left';
            this.ctx.textBaseline = 'middle';
            
            this.ctx.fillText(this.options.text, startX, centerY);
            
            // Reset scroll position when text completely exits
            if (startX + textWidth < 0) {
                this.scrollPosition = 0;
            }
        },
        
        startAnimation() {
            const animate = () => {
                // Calculate dynamic scroll speed for preview based on video duration
                this.ctx.font = this.getFontString();
                const textWidth = this.ctx.measureText(this.options.text).width;
                const totalDistance = this.canvas.width + textWidth;
                const totalFrames = this.options.videoDuration * 60; // 60 FPS
                const dynamicScrollSpeed = totalDistance / totalFrames;
                
                this.scrollPosition -= dynamicScrollSpeed;
                this.renderScrollingText();
                this.animationId = requestAnimationFrame(animate);
            };
            animate();
        },
        
        async startRecording() {
            try {
                this.isGeneratingVideo = true;
                this.statusText = 'フレーム生成中...';
                this.frames = [];
                this.currentFrame = 0;
                this.ffmpegProgress = 0;
                this.logs = [];
                
                this.addUserLog('動画生成を開始します', 'system');
                
                // Calculate total frames needed (60 FPS)
                this.ctx.font = this.getFontString();
                const textWidth = this.ctx.measureText(this.options.text).width;
                this.totalFrames = Math.round(this.options.videoDuration * 60); // 60 FPS
                
                // Calculate scroll speed to complete in given duration
                const totalDistance = this.canvas.width + textWidth;
                this.scrollSpeed = totalDistance / this.totalFrames;
                
                this.addUserLog(`${this.options.videoDuration}秒の動画（${this.totalFrames}フレーム @ 60fps）を生成予定`, 'system');
                
                // Generate all frames
                await this.generateAllFrames();
                
                this.addUserLog('フレーム生成完了', 'system');
                
                this.statusText = `${this.options.format}変換中...`;
                await this.convertFramesToVideo();
                
            } catch (error) {
                console.error('動画生成エラー:', error);
                this.statusText = `エラー: ${error.message}`;
                this.isGeneratingVideo = false;
            }
        },
        
        async generateAllFrames() {
            const centerY = this.canvas.height / 2;
            
            for (let frame = 0; frame < this.totalFrames; frame++) {
                const scrollPos = frame * this.scrollSpeed;
                const startX = this.canvas.width - scrollPos;
                
                // Clear and redraw background
                this.ctx.fillStyle = this.options.backgroundColor;
                this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                
                // Draw text
                this.ctx.font = this.getFontString();
                this.ctx.fillStyle = this.options.textColor;
                this.ctx.textAlign = 'left';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillText(this.options.text, startX, centerY);
                
                // Capture frame as blob
                const blob = await new Promise(resolve => this.canvas.toBlob(resolve, 'image/png'));
                this.frames.push(blob);
                this.currentFrame = frame + 1;
                
                // Update status
                this.statusText = `フレーム生成中... ${this.currentFrame}/${this.totalFrames}`;
                
                // Allow UI to update
                await new Promise(resolve => setTimeout(resolve, 1));
            }
        },

        async convertFramesToVideo() {
            const ffmpeg = await loadFFmpeg();
            
            // Setup logger for FFmpeg progress
            const logger = ({type, message}) => {
                console.log('[ffmpeg]', type, message);
                this.addUserLog(message, 'ffmpeg');
                
                // Parse progress from FFmpeg output
                const timeMatch = message.match(/^frame=.*?time=(\d+):(\d+):(\d+\.\d+)/);
                if (timeMatch) {
                    const h = parseInt(timeMatch[1], 10);
                    const m = parseInt(timeMatch[2], 10);
                    const s = parseFloat(timeMatch[3]);
                    const currentTime = h * 3600 + m * 60 + s;
                    
                    // Estimate total duration based on frame count and framerate
                    const totalDuration = this.frames.length / 60; // 60 FPS
                    this.ffmpegProgress = Math.min(100, (currentTime / totalDuration) * 100);
                }
                
                // Auto scroll logs
                setTimeout(() => {
                    if (this.$refs.log) {
                        this.$refs.log.scrollTop = this.$refs.log.scrollHeight;
                    }
                }, 10);
            };

            ffmpeg.on("log", logger);
            
            this.addUserLog('FFmpegを初期化しました', 'system');
            
            // Write all frames to FFmpeg filesystem
            this.addUserLog(`${this.frames.length}個のフレームをFFmpegに転送中...`, 'system');
            for (let i = 0; i < this.frames.length; i++) {
                const frameData = new Uint8Array(await this.frames[i].arrayBuffer());
                await ffmpeg.writeFile(`frame${i.toString().padStart(6, '0')}.png`, frameData);
            }

            this.addUserLog(`${this.options.format}エンコーディング開始`, 'system');
            if (this.options.format === 'gif') {
                await ffmpeg.exec([
                    '-framerate', '60',
                    '-i', 'frame%06d.png',
                    '-vf', 'scale=320:-1:flags=lanczos',
                    '-r', '15',
                    '-y',
                    'output.gif'
                ]);
                
                // Read the output file
                this.addUserLog('GIFファイルを読み込み中...', 'system');
                const data = await ffmpeg.readFile('output.gif');
                this.videoBlob = new Blob([data.buffer], { type: 'image/gif' });

                // Clean up FFmpeg filesystem
                this.addUserLog('一時ファイルをクリーンアップ中...', 'system');
                for (let i = 0; i < this.frames.length; i++) {
                    await ffmpeg.deleteFile(`frame${i.toString().padStart(6, '0')}.png`);
                }
                await ffmpeg.deleteFile('output.gif');

            } else {
                
                // Convert frames to MP4 (60 FPS)
                await ffmpeg.exec([
                    '-framerate', '60',
                    '-i', 'frame%06d.png',
                    '-c:v', 'libx264',
                    '-tune', 'stillimage',
                    '-preset', 'ultrafast',
                    '-x264-params', 'keyint=150',
                    '-pix_fmt', 'yuv420p',
                    '-crf', '28',
                    '-y',
                    'output.mp4'
                ]);
                
                // Read the output file
                this.addUserLog('MP4ファイルを読み込み中...', 'system');
                const data = await ffmpeg.readFile('output.mp4');
                this.videoBlob = new Blob([data.buffer], { type: 'video/mp4' });
                
                // Clean up FFmpeg filesystem
                this.addUserLog('一時ファイルをクリーンアップ中...', 'system');
                for (let i = 0; i < this.frames.length; i++) {
                    await ffmpeg.deleteFile(`frame${i.toString().padStart(6, '0')}.png`);
                }
                await ffmpeg.deleteFile('output.mp4');
            }
            this.addUserLog(`${this.options.format}変換完了！`, 'system');

            // Remove logger
            ffmpeg.off("log", logger);
            
            // Auto download
            this.statusText = 'ダウンロード中...';
            await this.downloadVideo();
        },
        
        async downloadVideo() {
            if (this.videoBlob) {
                if (this.blobURL) {
                    URL.revokeObjectURL(this.blobURL);
                }
                this.blobURL = URL.createObjectURL(this.videoBlob);

                this.$refs.videoPlayer.src = this.blobURL;

                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = this.blobURL;
                a.download = `scrolling-text-${new Date().getTime()}.${this.options.format}`;
                document.body.appendChild(a);
                a.click();
                
                this.addUserLog('動画ダウンロード完了！', 'system');
                this.statusText = 'ダウンロード完了 - 準備完了';
                this.isGeneratingVideo = false;
                this.frames = [];
                this.currentFrame = 0;
                this.totalFrames = 0;
                this.ffmpegProgress = 0;
            }
        },
        
        addUserLog(message, type = 'info') {
            const timestamp = new Date().toLocaleTimeString();
            this.logs.push({
                timestamp,
                message,
                type
            });
        },
        
        getFontString() {
            const fontName = this.options.selectedFont === 'Arial' ? 'Arial' : this.options.selectedFont.replace(/\+/g, ' ');
            return `${this.options.fontStyle} ${this.options.fontWeight} ${this.options.fontSize}px "${fontName}", Arial, sans-serif`;
        },
        
        loadOptionsFromHash() {
            const hash = location.hash.slice(1);
            if (!hash) return;
            
            try {
                const params = new URLSearchParams(hash);
                
                // URLパラメータから値を復元（textは除外）
                if (params.has('selectedFont')) this.options.selectedFont = params.get('selectedFont');
                if (params.has('fontWeight')) this.options.fontWeight = params.get('fontWeight');
                if (params.has('fontStyle')) this.options.fontStyle = params.get('fontStyle');
                if (params.has('textColor')) this.options.textColor = params.get('textColor');
                if (params.has('backgroundColor')) this.options.backgroundColor = params.get('backgroundColor');
                if (params.has('fontSize')) {
                    const fontSize = parseInt(params.get('fontSize'));
                    if (!isNaN(fontSize) && fontSize >= 160 && fontSize <= 960) {
                        this.options.fontSize = fontSize;
                    }
                }
                if (params.has('videoDuration')) {
                    const videoDuration = parseFloat(params.get('videoDuration'));
                    if (!isNaN(videoDuration) && videoDuration >= 1 && videoDuration <= 5) {
                        this.options.videoDuration = videoDuration;
                    }
                }
                if (params.has('format')) this.options.format = params.get('format') === 'gif' ? 'gif' : 'mp4';
            } catch (error) {
                console.error('Failed to parse hash parameters:', error);
            }
        },
        
        updateHashFromOptions() {
            const params = new URLSearchParams();
            
            // デフォルト値と異なる場合のみパラメータに含める
            // textは除外する
            if (this.options.selectedFont !== 'Noto+Sans+JP') params.set('selectedFont', this.options.selectedFont);
            if (this.options.fontWeight !== '900') params.set('fontWeight', this.options.fontWeight);
            if (this.options.fontStyle !== 'normal') params.set('fontStyle', this.options.fontStyle);
            if (this.options.textColor !== '#ffffff') params.set('textColor', this.options.textColor);
            if (this.options.backgroundColor !== '#000000') params.set('backgroundColor', this.options.backgroundColor);
            if (this.options.fontSize !== 640) params.set('fontSize', this.options.fontSize.toString());
            if (this.options.videoDuration !== 3) params.set('videoDuration', this.options.videoDuration.toString());
            if (this.options.format !== 'mp4') params.set('format', this.options.format);
            
            const hash = params.toString();
            if (hash) {
                location.hash = hash;
            } else {
                location.hash = '';
            }
        }
    }
}).mount('#app');
