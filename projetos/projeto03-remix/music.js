// A small house loop synthesised with WebAudio: no sound files, every note is built here.
export const BPM = 124;

// Am - F - C - G, as MIDI root notes and the chord's intervals
const CHORDS = [[45, [0,3,7]], [41, [0,4,7]], [48, [0,4,7]], [43, [0,4,7]]];
const ARP = [0, 1, 2, 3, 2, 1, 2, 3];

const midi = n => 440 * Math.pow(2, (n - 69) / 12);

// the last bar of every eight drops the kick on its second half, for a build-up
export function hasKick(step) {
    const bar = Math.floor(step / 16), s = step % 16;
    return s % 4 == 0 && !(bar % 8 == 7 && s >= 8);
}

export const chordOf = bar => bar % CHORDS.length;
export const isDrop = bar => bar % 8 >= 4;

export function startMusic() {
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(ctx.destination);

    // dotted-eighth echo for the arpeggio
    const delay = ctx.createDelay();
    delay.delayTime.value = 60 / BPM * 0.75;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.35;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wet);
    wet.connect(master);

    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for(let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    function envelope(t, peak, decay) {
        const g = ctx.createGain();
        g.gain.setValueAtTime(peak, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + decay);
        g.connect(master);
        return g;
    }

    function kick(t) {
        const osc = ctx.createOscillator();
        osc.frequency.setValueAtTime(160, t);
        osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
        osc.connect(envelope(t, 1, 0.45));
        osc.start(t);
        osc.stop(t + 0.5);
    }

    function hit(t, type, freq, decay, peak) {
        const src = ctx.createBufferSource();
        src.buffer = noise;
        const filter = ctx.createBiquadFilter();
        filter.type = type;
        filter.frequency.value = freq;
        src.connect(filter);
        filter.connect(envelope(t, peak, decay));
        src.start(t);
        src.stop(t + decay + 0.05);
    }

    function bass(t, f) {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = f;
        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(1400, t);
        filter.frequency.exponentialRampToValueAtTime(180, t + 0.2);
        osc.connect(filter);
        filter.connect(envelope(t, 0.35, 0.25));
        osc.start(t);
        osc.stop(t + 0.3);
    }

    function pluck(t, f) {
        const osc = ctx.createOscillator();
        osc.type = "square";
        osc.frequency.value = f;
        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 2800;
        osc.connect(filter);
        const g = envelope(t, 0.09, 0.16);
        filter.connect(g);
        g.connect(delay);
        osc.start(t);
        osc.stop(t + 0.2);
    }

    function play(step, t) {
        const bar = Math.floor(step / 16), s = step % 16;
        const [root, chord] = CHORDS[chordOf(bar)];
        const notes = [...chord, 12];
        if(hasKick(step)) kick(t);
        if(s == 4 || s == 12) hit(t, "bandpass", 1500, 0.18, 0.7);
        if(s % 4 == 2) hit(t, "highpass", 7000, 0.12, 0.35);
        else if(isDrop(bar)) hit(t, "highpass", 9000, 0.04, 0.15);
        // snare roll building into the next section
        if(bar % 8 == 7 && s >= 8) hit(t, "bandpass", 1800, 0.1, 0.2 + 0.04 * (s - 8));
        if(s % 4 == 2 || (isDrop(bar) && s % 4 == 3)) bass(t, midi(root - 12));
        if(bar % 8 >= 2) pluck(t, midi(root + 24 + notes[ARP[s % ARP.length]]));
    }

    const stepTime = 60 / BPM / 4;
    const start = ctx.currentTime + 0.1;
    const t0 = performance.now() / 1000 + 0.1;
    let next = 0;
    // schedule a little ahead of the audio clock so timers never make it stutter
    const timer = setInterval(() => {
        while(start + next * stepTime < ctx.currentTime + 0.2) {
            play(next, start + next * stepTime);
            next++;
        }
    }, 25);

    return {
        // position in beats; falls back to the page clock when audio can't run
        beat() {
            const t = ctx.state == "running" ? ctx.currentTime - start : performance.now() / 1000 - t0;
            return Math.max(0, t) * BPM / 60;
        },
        stop() {
            clearInterval(timer);
            master.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
            setTimeout(() => ctx.close(), 400);
        }
    };
}
