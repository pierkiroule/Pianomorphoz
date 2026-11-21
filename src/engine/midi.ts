export class MidiEngine {
  access: MIDIAccess | null = null;
  notes = new Map<number, number>();
  sustain = false;
  onNote: (pitch: number, velocity: number) => void = () => {};
  onChange: () => void = () => {};

  async connect(): Promise<void> {
    if (!navigator.requestMIDIAccess) {
      throw new Error('Web MIDI non disponible dans ce navigateur');
    }

    this.disconnect();
    const access = await navigator.requestMIDIAccess();
    this.access = access;

    const onMessage = (event: MIDIMessageEvent): void => {
      if (!event.data || event.data.length < 3) return;
      const [status, note, value] = event.data;
      const command = status & 0xf0;

      if (command === 0x90 && value > 0) {
        this.notes.set(note, value);
        this.onNote(note, value);
      } else if (command === 0x80 || (command === 0x90 && value === 0)) {
        this.notes.delete(note);
      } else if (command === 0xb0 && note === 64) {
        this.sustain = value >= 64;
      }
      this.onChange();
    };

    const bindInputs = (): void => {
      for (const input of access.inputs.values()) {
        input.onmidimessage = onMessage;
      }
      this.onChange();
    };

    bindInputs();
    access.onstatechange = bindInputs;
  }

  disconnect(): void {
    const access = this.access;
    if (access) {
      access.onstatechange = null;
      for (const input of access.inputs.values()) {
        input.onmidimessage = null;
      }
    }
    this.access = null;
    this.notes.clear();
    this.sustain = false;
    this.onChange();
  }
}
