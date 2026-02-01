// Shared notification sound module for dashboard and staff-dashboard
// No side effects on import — caller must invoke initSound() and playNotificationSound()

let audioContext = null;
let notificationAudio = null;
let soundEnabled = false;

export function isSoundEnabled() {
    return soundEnabled;
}

function preloadNotificationSound() {
    notificationAudio = new Audio('/assets/sounds/notification.wav');
    notificationAudio.preload = 'auto';
    notificationAudio.volume = 0.5;
}

export function initSound() {
    if (soundEnabled) return;
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        preloadNotificationSound();
        soundEnabled = true;
    } catch (e) {
        console.log('Could not initialize audio:', e);
    }
}

export function cleanupSound() {
    if (audioContext) {
        audioContext.close().catch(() => {});
        audioContext = null;
    }
    notificationAudio = null;
}

function playWebAudioNotification() {
    try {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }

        const osc1 = audioContext.createOscillator();
        const osc2 = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        osc1.connect(gainNode);
        osc2.connect(gainNode);
        gainNode.connect(audioContext.destination);

        osc1.frequency.value = 880;
        osc1.type = 'sine';
        osc2.frequency.value = 1108.73;
        osc2.type = 'sine';

        const now = audioContext.currentTime;
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.3, now + 0.05);
        gainNode.gain.linearRampToValueAtTime(0.2, now + 0.15);
        gainNode.gain.linearRampToValueAtTime(0.3, now + 0.2);
        gainNode.gain.linearRampToValueAtTime(0, now + 0.35);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.35);
        osc2.stop(now + 0.35);
    } catch (e) {
        console.log('Could not play notification sound:', e);
    }
}

export function playNotificationSound() {
    if (!soundEnabled) return;

    if (notificationAudio) {
        notificationAudio.currentTime = 0;
        notificationAudio.play().catch(() => {
            playWebAudioNotification();
        });
        return;
    }

    playWebAudioNotification();
}
