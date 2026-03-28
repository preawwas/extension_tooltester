/**
 * Voice Recorder Tool
 */
class VoiceRecorderTool {
    constructor(manager) {
        this.manager = manager;
        this.active = false;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.timerInterval = null;
        this.elapsedSeconds = 0;
        this.isPaused = false;

        this.svgPause = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
        this.svgPlay = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
        this.svgStop = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z"/></svg>';

        this.toolbar = null;
        this.timeDisplay = null;
        this.dotDisplay = null;
        this.pauseBtn = null;
    }

    async toggle() {
        if (this.active) {
            this.stopRecording();
        } else {
            await this.startRecording();
        }
    }

    async startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            let options = { mimeType: 'audio/webm' };
            if (!MediaRecorder.isTypeSupported('audio/webm')) {
                options = {}; // use defaults
            }

            this.mediaRecorder = new MediaRecorder(stream, options);
            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                if (this.audioChunks.length === 0) {
                    this.deactivate();
                    return;
                }

                const audioBlob = new Blob(this.audioChunks, { type: this.mediaRecorder.mimeType || 'audio/webm' });
                const audioUrl = URL.createObjectURL(audioBlob);

                // Thai date/time filename
                const now = new Date();
                const thaiDate = now.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
                const hours = now.getHours().toString().padStart(2, '0');
                const minutes = now.getMinutes().toString().padStart(2, '0');
                const thaiTime = `${hours}h${minutes}`;

                // Trigger download
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = audioUrl;
                a.download = `voice_${thaiDate}_${thaiTime}.mp3`;
                document.body.appendChild(a);
                a.click();

                setTimeout(() => {
                    document.body.removeChild(a);
                    URL.revokeObjectURL(audioUrl);
                }, 100);

                this.deactivate();
                this.manager.showToast('บันทึกเสียงเรียบร้อย!');
            };

            this.mediaRecorder.start(100); // 100ms time slice to ensure chunks exist
            this.active = true;
            this.isPaused = false;
            this.elapsedSeconds = 0;

            this.showToolbar();
            this.startTimer();
            this.manager.showToast('Voice recording started...');
        } catch (err) {
            console.error('Microphone access denied:', err);
            this.manager.showToast('Microphone access denied or not available.');
            this.deactivate();
        }
    }

    pauseRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.pause();
            this.isPaused = true;
            clearInterval(this.timerInterval);
            this.dotDisplay.style.animation = 'none';
            this.dotDisplay.style.opacity = '0.5';
            this.pauseBtn.innerHTML = this.svgPlay;
        }
    }

    resumeRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
            this.mediaRecorder.resume();
            this.isPaused = false;

            this.startTimer();

            this.dotDisplay.style.animation = ''; // restores CSS pulse
            this.dotDisplay.style.opacity = '1';
            this.pauseBtn.innerHTML = this.svgPause;
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            const stream = this.mediaRecorder.stream;
            stream.getTracks().forEach(track => track.stop());
            this.mediaRecorder.stop();
        } else {
            this.deactivate();
        }
    }

    deactivate() {
        this.active = false;
        clearInterval(this.timerInterval);
        this.removeToolbar();
    }

    startTimer() {
        this.timerInterval = setInterval(() => {
            if (this.isPaused) return;
            this.elapsedSeconds++;
            this.updateTimeDisplay(this.elapsedSeconds);
        }, 1000);
    }

    updateTimeDisplay(seconds) {
        if (!this.timeDisplay) return;
        const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
        const secs = (seconds % 60).toString().padStart(2, '0');
        this.timeDisplay.textContent = `${minutes}:${secs}`;
    }

    showToolbar() {
        this.removeToolbar();

        const toolbar = document.createElement('div');
        toolbar.className = 'mte-recorder-toolbar';
        toolbar.style.cssText = `
            position: fixed;
            top: 24px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(0, 0, 0, 0.06);
            border-radius: 999px;
            box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
            display: flex;
            align-items: center;
            padding: 4px 6px;
            gap: 6px;
            z-index: 100002;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            user-select: none;
            cursor: move;
        `;

        // Time Container (Dot + Time)
        const timeContainer = document.createElement('div');
        timeContainer.style.cssText = 'display: flex; align-items: center; gap: 8px; padding: 0 10px 0 8px;';

        this.dotDisplay = document.createElement('div');
        this.dotDisplay.className = 'mte-pulse';
        this.dotDisplay.style.cssText = 'width: 8px; height: 8px; background-color: #ef4444; border-radius: 50%; box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); flex-shrink: 0;';

        this.timeDisplay = document.createElement('span');
        this.timeDisplay.textContent = '00:00';
        this.timeDisplay.style.cssText = 'color: #111827; font-size: 14px; font-weight: 500; font-variant-numeric: tabular-nums; letter-spacing: 0.5px;';

        timeContainer.appendChild(this.dotDisplay);
        timeContainer.appendChild(this.timeDisplay);
        toolbar.appendChild(timeContainer);

        // Divider
        const divider = document.createElement('div');
        divider.style.cssText = 'width: 1px; height: 16px; background: rgba(0, 0, 0, 0.08); flex-shrink: 0; margin-right: 4px;';
        toolbar.appendChild(divider);

        // Common Button Style
        const btnStyle = `
            background: transparent;
            border: none;
            color: #4b5563;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            cursor: pointer;
            transition: all 0.2s;
            padding: 0;
            user-select: none;
        `;

        // Pause / Resume Button
        this.pauseBtn = document.createElement('button');
        this.pauseBtn.style.cssText = btnStyle;
        this.pauseBtn.innerHTML = this.svgPause;
        this.pauseBtn.onmouseover = () => { this.pauseBtn.style.background = '#f3f4f6'; this.pauseBtn.style.color = '#111827'; };
        this.pauseBtn.onmouseout = () => { this.pauseBtn.style.background = 'transparent'; this.pauseBtn.style.color = '#4b5563'; };

        this.pauseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.isPaused) {
                this.resumeRecording();
            } else {
                this.pauseRecording();
            }
        });
        toolbar.appendChild(this.pauseBtn);

        // Stop Button
        const stopBtn = document.createElement('button');
        stopBtn.style.cssText = btnStyle;
        stopBtn.innerHTML = this.svgStop;
        stopBtn.onmouseover = () => { stopBtn.style.background = '#fee2e2'; stopBtn.style.color = '#ef4444'; };
        stopBtn.onmouseout = () => { stopBtn.style.background = 'transparent'; stopBtn.style.color = '#4b5563'; };

        stopBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.stopRecording();
        });
        toolbar.appendChild(stopBtn);

        // Drag support for toolbar
        toolbar.addEventListener('mousedown', (e) => {
            if (e.target.closest('button')) return;
            e.preventDefault();
            const rect = toolbar.getBoundingClientRect();
            this._toolbarDrag = {
                offsetX: e.clientX - rect.left,
                offsetY: e.clientY - rect.top,
                onMove: (ev) => {
                    toolbar.style.left = (ev.clientX - this._toolbarDrag.offsetX) + 'px';
                    toolbar.style.top = (ev.clientY - this._toolbarDrag.offsetY) + 'px';
                    toolbar.style.transform = 'none';
                },
                onUp: () => {
                    document.removeEventListener('mousemove', this._toolbarDrag.onMove, true);
                    document.removeEventListener('mouseup', this._toolbarDrag.onUp, true);
                    this._toolbarDrag = null;
                }
            };
            document.addEventListener('mousemove', this._toolbarDrag.onMove, true);
            document.addEventListener('mouseup', this._toolbarDrag.onUp, true);
        });

        document.body.appendChild(toolbar);
        this.toolbar = toolbar;
    }

    removeToolbar() {
        if (this.toolbar) {
            this.toolbar.remove();
            this.toolbar = null;
        }
    }
}
