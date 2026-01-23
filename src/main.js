import './style.css'
import Alpine from 'alpinejs'
import persist from '@alpinejs/persist'

Alpine.plugin(persist)

Alpine.data('app', () => ({
    screen: Alpine.$persist('login'), // login, home, workout, summary
    apiUrl: Alpine.$persist(import.meta.env.VITE_API_URL || ''),
    user: Alpine.$persist(null),
    
    loginForm: {
        username: '',
        password: '',
        error: '',
        isLoading: false
    },

    difficulties: [],
    currentDifficulty: Alpine.$persist(null),
    
    activeWorkout: {
        sets: [],
        currentSetIndex: 0,
        currentCount: 0,
        isResting: false,
        restTimeLeft: 0,
        customRestTime: Alpine.$persist(60),
        isSaving: false
    },
    
    // Calendar related state
    calendar: {
        currentDate: new Date(),
        days: [],
        monthName: '',
        records: [], // All records fetched from backend
        selectedDateRecords: null,
        selectedDateStr: null
    },

    // Audio context for beep sound
    audioContext: null,

    // Wake Lock
    wakeLock: null,

    async requestWakeLock() {
        if ('wakeLock' in navigator) {
            try {
                this.wakeLock = await navigator.wakeLock.request('screen');
                this.wakeLock.addEventListener('release', () => {
                    // console.log('Wake Lock released');
                    this.wakeLock = null;
                });
            } catch (err) {
                console.error(`${err.name}, ${err.message}`);
            }
        }
    },

    async releaseWakeLock() {
        if (this.wakeLock !== null) {
            await this.wakeLock.release();
            this.wakeLock = null;
        }
    },

    async init() {
        if (this.user) {
            if (this.screen === 'login') this.screen = 'home';
            await this.fetchDifficulties();
        }
        
        // Re-request wake lock when visibility changes (if it was released by system)
        document.addEventListener('visibilitychange', async () => {
            if (this.wakeLock !== null && document.visibilityState === 'visible') {
                await this.requestWakeLock();
            }
        });

        // Initialize AudioContext on user interaction
        setInterval(() => {
            if (this.activeWorkout.isResting && this.activeWorkout.restTimeLeft > 0) {
                this.activeWorkout.restTimeLeft--;
                if (this.activeWorkout.restTimeLeft <= 0) {
                    this.activeWorkout.isResting = false;
                }
            }
        }, 1000);
    },

    async login() {
        this.loginForm.error = '';
        if (this.loginForm.isLoading) return;

        if (!this.apiUrl) {
            this.loginForm.error = 'Please set API URL';
            return;
        }
        
        this.loginForm.isLoading = true;
        try {
            const res = await fetch(`${this.apiUrl}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: this.loginForm.username,
                    password: this.loginForm.password
                }),
                credentials: 'include'
            });
            if (!res.ok) throw new Error('Login failed');
            const data = await res.json();
            this.user = data.user;
            this.screen = 'home';
            this.fetchDifficulties();
        } catch (e) {
            this.loginForm.error = e.message;
        } finally {
            this.loginForm.isLoading = false;
        }
    },
    
    async fetchDifficulties() {
        if (!this.apiUrl) return;
        try {
            const res = await fetch(`${this.apiUrl}/api/difficulties`);
            if (res.status === 401) {
                this.logout();
                return;
            }
            const data = await res.json();
            this.difficulties = data.map(d => ({
                ...d,
                countsArr: d.counts.split(',').map(Number)
            }));
            
            if (this.user && this.user.current_difficulty_id) {
                // Find based on difficulty ID stored in user profile
                this.currentDifficulty = this.difficulties.find(d => d.id === this.user.current_difficulty_id) || this.difficulties[0];
            } else if (this.difficulties.length > 0) {
                this.currentDifficulty = this.difficulties[0];
            }
            
            // Also fetch records if we are initializing
            this.fetchRecords();
        } catch (e) {
            console.error('Failed to fetch difficulties', e);
        }
    },

    async fetchRecords() {
        if (!this.apiUrl || !this.user) return;
        try {
            const res = await fetch(`${this.apiUrl}/api/records`, { credentials: 'include' });
            if (res.status === 401) return; // Handled elsewhere usually
            const data = await res.json();
            
            // Convert records to UTC+8 local time string "YYYY-MM-DD" for easy matching
            this.calendar.records = data.map(r => {
                // created_at is either timestamp (int) or "YYYY-MM-DD HH:mm:ss" (string)
                let dateObj;
                if (typeof r.created_at === 'number') {
                    dateObj = new Date(r.created_at);
                } else {
                    // It's a string "YYYY-MM-DD HH:mm:ss" which is implicitly UTC in our logic (or whatever server time)
                    // But wait, the previous code saved it as string.
                    // If we want to treat it as UTC and convert to +8:
                    // new Date("2026-01-22 15:30:45Z") -> UTC
                    // But the DB string doesn't have Z. "2026-01-22 15:30:45".
                    // If we assume it was saved as UTC, we append 'Z'.
                    dateObj = new Date(r.created_at.replace(' ', 'T') + 'Z');
                }
                
                // Add 8 hours for display
                const utc8Date = new Date(dateObj.getTime() + 8 * 60 * 60 * 1000); // Shift time for display logic if we were rendering strictly
                // Actually, let's just use standard Intl formatter for "Asia/Shanghai"
                
                const fmt = new Intl.DateTimeFormat('en-CA', { 
                    timeZone: 'Asia/Shanghai', 
                    year: 'numeric', month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit', second: '2-digit',
                    hour12: false
                });
                // en-CA gives YYYY-MM-DD
                const parts = fmt.formatToParts(dateObj);
                const part = (type) => parts.find(p => p.type === type).value;
                const dateStr = `${part('year')}-${part('month')}-${part('day')}`;
                const timeStr = `${part('hour')}:${part('minute')}`;
                
                return {
                    ...r,
                    displayDate: dateStr, // YYYY-MM-DD in +8
                    displayTime: timeStr  // HH:mm in +8
                };
            });
            
            this.renderCalendar();
        } catch (e) {
            console.error('Failed to fetch records', e);
        }
    },
    
    renderCalendar() {
        const year = this.calendar.currentDate.getFullYear();
        const month = this.calendar.currentDate.getMonth();
        
        // Month name
        this.calendar.monthName = new Date(year, month).toLocaleString('default', { month: 'long', year: 'numeric' });
        
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        
        const days = [];
        const startPadding = firstDay.getDay(); // 0 is Sunday
        
        // Padding days
        for (let i = 0; i < startPadding; i++) {
            days.push({ day: '', fullDate: null, hasRecord: false });
        }
        
        // Actual days
        for (let i = 1; i <= lastDay.getDate(); i++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            
            // Find records for this day
            const dayRecords = this.calendar.records.filter(r => r.displayDate === dateStr);
            const totalCount = dayRecords.reduce((sum, r) => sum + r.total_count, 0);
            
            days.push({
                day: i,
                fullDate: dateStr,
                hasRecord: dayRecords.length > 0,
                totalCount: totalCount,
                records: dayRecords
            });
        }
        
        this.calendar.days = days;
    },
    
    prevMonth() {
        this.calendar.currentDate.setMonth(this.calendar.currentDate.getMonth() - 1);
        this.calendar.currentDate = new Date(this.calendar.currentDate); // trigger reactivity
        this.renderCalendar();
    },
    
    nextMonth() {
        this.calendar.currentDate.setMonth(this.calendar.currentDate.getMonth() + 1);
        this.calendar.currentDate = new Date(this.calendar.currentDate);
        this.renderCalendar();
    },
    
    selectDate(day) {
        if (!day.fullDate || !day.hasRecord) return;
        this.calendar.selectedDateStr = day.fullDate;
        this.calendar.selectedDateRecords = day.records;
    },
    
    closeCalendarDetails() {
        this.calendar.selectedDateRecords = null;
    },
    
    openHistory() {
        this.fetchRecords();
        this.screen = 'history';
    },

    selectDifficulty(diff) {
        if (!diff) return;
        this.currentDifficulty = diff;
        // User manually selected a difficulty, update backend so it persists across reloads/sessions
        if (this.user) {
            this.user.current_difficulty_id = diff.id;
            // Optimistically update, send to backend in background
            fetch(`${this.apiUrl}/api/user/difficulty`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ difficulty_id: diff.id }),
                credentials: 'include'
            }).catch(console.error);
        }
    },

    startWorkout() {
        if (!this.currentDifficulty) return;
        this.activeWorkout.sets = [...this.currentDifficulty.countsArr];
        this.activeWorkout.currentSetIndex = 0;
        this.activeWorkout.currentCount = 0;
        this.activeWorkout.isResting = false;
        this.screen = 'workout';
        this.requestWakeLock();
    },

    quitWorkout() {
        if (confirm('Are you sure you want to quit current workout?')) {
            this.screen = 'home';
            this.activeWorkout.isResting = false;
            this.releaseWakeLock();
        }
    },

    playBeep() {
        try {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }

            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();

            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(880, this.audioContext.currentTime); // A5 (High beep)
            
            gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.1);

            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            oscillator.start();
            oscillator.stop(this.audioContext.currentTime + 0.1);
        } catch (e) {
            console.error('Audio play failed', e);
        }
    },

    tap() {
        if (this.activeWorkout.isResting) return;
        
        this.playBeep();
        
        const target = this.activeWorkout.sets[this.activeWorkout.currentSetIndex];
        
        if (this.activeWorkout.currentCount < target) {
            this.activeWorkout.currentCount++;
        }
        
        if (this.activeWorkout.currentCount >= target) {
            this.completeSet();
        }
    },
    
    skipSet() {
        if (this.activeWorkout.isResting) {
             this.activeWorkout.isResting = false;
             return;
        }
        this.activeWorkout.currentCount = this.activeWorkout.sets[this.activeWorkout.currentSetIndex];
        this.completeSet();
    },

    completeSet() {
        if (this.activeWorkout.currentSetIndex >= 4) {
            this.screen = 'summary';
        } else {
            this.activeWorkout.currentSetIndex++;
            this.activeWorkout.currentCount = 0;
            this.activeWorkout.isResting = true;
            this.activeWorkout.restTimeLeft = this.activeWorkout.customRestTime;
        }
    },

    async finishWorkout(increaseDifficulty) {
        if (this.activeWorkout.isSaving) return;
        this.activeWorkout.isSaving = true;

        try {
            // Submit record
            const res = await fetch(`${this.apiUrl}/api/records`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    difficulty_id: this.currentDifficulty.id,
                    total_count: this.activeWorkout.sets.reduce((a,b)=>a+b, 0)
                }),
                credentials: 'include'
            });

            if (res.status === 401) {
                const errorBody = await res.json();
                alert('Session expired. Please log in again.' + ' record: ' + errorBody.error);
                this.logout();
                return;
            }

            if (!res.ok) throw new Error('Failed to save record');

            if (increaseDifficulty) {
                // Find next difficulty
                const currentIndex = this.difficulties.findIndex(d => d.id === this.currentDifficulty.id);
                if (currentIndex < this.difficulties.length - 1) {
                    const nextDiff = this.difficulties[currentIndex + 1];
                    
                    // Update user difficulty in backend
                    const diffRes = await fetch(`${this.apiUrl}/api/user/difficulty`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ difficulty_id: nextDiff.id }),
                        credentials: 'include'
                    });

                    if (diffRes.status === 401) {
                        const errorBody = await res.json();
                        alert('Session expired during update. Please log in again.' + ' diffRes: ' + errorBody.error);
                        this.logout();
                        return;
                    }
                    
                    this.currentDifficulty = nextDiff;
                    this.user.current_difficulty_id = nextDiff.id;
                }
            }
            
            this.screen = 'home';
        } catch (e) {
            alert('Error saving workout: ' + e.message);
            this.screen = 'home';
        } finally {
            this.activeWorkout.isSaving = false;
            this.releaseWakeLock();
        }
    },
    
    async logout() {
        try {
            if (this.apiUrl) {
                await fetch(`${this.apiUrl}/api/logout`, { method: 'POST', credentials: 'include' });
            }
        } catch (e) {
            console.error('Logout failed', e);
        }
        this.user = null;
        this.screen = 'login';
        this.currentDifficulty = null;
    },
    
    get progressPercentage() {
        if (this.activeWorkout.isResting) return 100;
        const target = this.activeWorkout.sets[this.activeWorkout.currentSetIndex] || 1;
        return (this.activeWorkout.currentCount / target) * 100;
    }
}))

window.Alpine = Alpine
Alpine.start()
