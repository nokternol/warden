import ky from 'ky';

interface PlexPin {
  id: number;
  code: string;
}

interface PlexPinResponse {
  id: number;
  code: string;
  authToken?: string;
}

export class PlexOAuth {
  private plexHeaders: Record<string, string>;
  private pin?: PlexPin;
  private popup?: Window | null;

  constructor() {
    this.plexHeaders = this.initializeHeaders();
  }

  private initializeHeaders(): Record<string, string> {
    let clientId = localStorage.getItem('plex-client-id');
    if (!clientId) {
      clientId = crypto.randomUUID();
      localStorage.setItem('plex-client-id', clientId);
    }

    return {
      Accept: 'application/json',
      'X-Plex-Product': 'Warden',
      'X-Plex-Version': '1.0',
      'X-Plex-Client-Identifier': clientId,
      'X-Plex-Platform': 'Web',
      'X-Plex-Device': 'Browser',
      'X-Plex-Device-Name': 'Warden (Web)',
    };
  }

  async getPin(): Promise<PlexPin> {
    const data = await ky
      .post('https://plex.tv/api/v2/pins?strong=true', { headers: this.plexHeaders })
      .json<PlexPinResponse>();

    this.pin = { id: data.id, code: data.code };
    return this.pin;
  }

  // Must be called synchronously inside the click handler (requires a user gesture).
  // Opening to about:blank gives us a same-origin proxy that retains close() permission
  // even after the popup navigates cross-origin to Plex.
  preparePopup(): void {
    this.popup = window.open('about:blank', 'Plex-Auth', 'width=600,height=700');
  }

  openPopup(): void {
    if (!this.pin) return;

    const params = new URLSearchParams({
      clientID: this.plexHeaders['X-Plex-Client-Identifier'],
      code: this.pin.code,
      'context[device][product]': this.plexHeaders['X-Plex-Product'],
    });

    const url = `https://app.plex.tv/auth/#!?${params.toString()}`;

    if (this.popup) {
      this.popup.location.href = url;
    } else {
      this.popup = window.open(url, 'Plex-Auth', 'width=600,height=700');
    }
  }

  async pollForToken(): Promise<string> {
    if (!this.pin) {
      throw new Error('No PIN. Call getPin() first.');
    }

    return new Promise((resolve, reject) => {
      let done = false;
      const startTime = Date.now();

      const finish = (fn: () => void) => {
        if (done) return;
        done = true;
        clearTimeout(timeoutId);
        window.removeEventListener('focus', onFocus);
        fn();
      };

      const timeoutId = setTimeout(() => {
        finish(() => reject(new Error('Authentication timeout')));
      }, 300000); // 5 minutes

      // When the main window regains focus the popup was likely closed.
      // popup.closed is unreliable for cross-origin windows (always true in Chrome),
      // so we use window focus + a final token check instead.
      const onFocus = () => {
        if (Date.now() - startTime < 3000) return;
        setTimeout(async () => {
          if (done) return;
          try {
            const data = await ky
              .get(`https://plex.tv/api/v2/pins/${this.pin!.id}`, { headers: this.plexHeaders })
              .json<PlexPinResponse>();
            if (!data.authToken) {
              finish(() => reject(new Error('Authentication cancelled')));
            }
          } catch {
            /* ignore — let the poll loop handle errors */
          }
        }, 500);
      };
      window.addEventListener('focus', onFocus);

      const poll = async () => {
        if (done) return;
        try {
          const data = await ky
            .get(`https://plex.tv/api/v2/pins/${this.pin!.id}`, { headers: this.plexHeaders })
            .json<PlexPinResponse>();

          if (data.authToken) {
            finish(() => {
              try {
                this.popup?.close();
              } catch {
                /* ignore */
              }
              resolve(data.authToken!);
            });
            return;
          }
        } catch (error) {
          finish(() => reject(error));
          return;
        }

        setTimeout(poll, 1000);
      };

      setTimeout(poll, 1000);
    });
  }

  async login(): Promise<string> {
    await this.getPin();
    this.openPopup();
    return this.pollForToken();
  }

  close(): void {
    try {
      this.popup?.close();
    } catch {
      /* cross-origin close may throw; ignore */
    }
  }
}
