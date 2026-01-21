import './style.css'
import Alpine from 'alpinejs'
import persist from '@alpinejs/persist'

Alpine.plugin(persist)

Alpine.data('app', () => ({
    screen: Alpine.$persist('login'), // login, home, workout, summary
    apiUrl: Alpine.$persist(''),
    user: Alpine.$persist(null),
    
    loginForm: {
        username: '',
        password: '',
        error: ''
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
    },

    async init() {
        if (this.user) {
            if (this.screen === 'login') this.screen = 'home';
            await this.fetchDifficulties();
        }
        
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
        if (!this.apiUrl) {
            this.loginForm.error = 'Please set API URL';
            return;
        }
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
                this.currentDifficulty = this.difficulties.find(d => d.id === this.user.current_difficulty_id) || this.difficulties[0];
            } else if (this.difficulties.length > 0) {
                this.currentDifficulty = this.difficulties[0];
            }
        } catch (e) {
            console.error('Failed to fetch difficulties', e);
        }
    },

    selectDifficulty(diff) {
        this.currentDifficulty = diff;
        // Optionally update backend immediately or just on workout start?
        // User requirement 3: "Select difficulty... enter workout".
        // Also "Submit data to backend... modify difficulty" logic exists.
        // Let's just update local state for now.
    },

    startWorkout() {
        if (!this.currentDifficulty) return;
        this.activeWorkout.sets = [...this.currentDifficulty.countsArr];
        this.activeWorkout.currentSetIndex = 0;
        this.activeWorkout.currentCount = 0;
        this.activeWorkout.isResting = false;
        this.screen = 'workout';
    },

    tap() {
        if (this.activeWorkout.isResting) return;
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
                this.logout();
                return;
            }

            if (increaseDifficulty) {
                // Find next difficulty
                const currentIndex = this.difficulties.findIndex(d => d.id === this.currentDifficulty.id);
                if (currentIndex < this.difficulties.length - 1) {
                    const nextDiff = this.difficulties[currentIndex + 1];
                    this.currentDifficulty = nextDiff;
                    // Update user difficulty in backend
                    await fetch(`${this.apiUrl}/api/user/difficulty`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ difficulty_id: nextDiff.id }),
                        credentials: 'include'
                    });
                    this.user.current_difficulty_id = nextDiff.id;
                }
            }
            
            this.screen = 'home';
        } catch (e) {
            alert('Error saving workout: ' + e.message);
            this.screen = 'home';
        }
    },
    
    logout() {
        this.user = null;
        this.screen = 'login';
        // Clear cookie if possible or just forget local user
    },
    
    get progressPercentage() {
        if (this.activeWorkout.isResting) return 100;
        const target = this.activeWorkout.sets[this.activeWorkout.currentSetIndex] || 1;
        return (this.activeWorkout.currentCount / target) * 100;
    }
}))

window.Alpine = Alpine
Alpine.start()
