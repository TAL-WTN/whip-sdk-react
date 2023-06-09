import { EventEmitter } from 'events';
import { decodeJwt } from 'jose';
import {deleteRequest, pullRequest, updateRequest} from './request';

export default class Subscriber extends EventEmitter {
  constructor(token: string) {
    super();
    const { appID, streamID } = decodeJwt(token) as { appID: string, streamID: string };
    this.streamId = streamID;
    this.appId = appID;
    this.token = token;
    this.createRTCPeerConnection();
  }

  pc: RTCPeerConnection;

  appId: string;

  streamId: string;

  token: string;

  audio: MediaStreamTrack;

  video: MediaStreamTrack;

  audioMuted: boolean = false;

  videoMuted: boolean = false;

  sessionId: string;

  location?: string;

  get state(): RTCPeerConnectionState {
    return this.pc.connectionState;
  }

  createRTCPeerConnection() {
    this.pc = new RTCPeerConnection({
      iceServers: [],
      iceTransportPolicy: "all",
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
      // @ts-ignore
      sdpSemantics: "unified-plan",
    });
    this.pc.addTransceiver( 'audio', { direction: 'recvonly' });
    this.pc.addTransceiver('video', { direction: 'recvonly' });

    this.pc.addEventListener('connectionstatechange', this.emit.bind(this.pc));
    this.pc.addEventListener('track', (evt: RTCTrackEvent) => {
      if (evt.track) {
        if (evt.track.kind === 'audio') {
          this.audio = evt.track;
        } else {
          this.video = evt.track;
        }
      }
      this.emit('trackAdded', evt.track);
    });

  }

  async subscribe() {
    if (this.pc.connectionState !== 'new') {
      throw new Error('Already subscribed.')
    }
    const offer = await this.pc.createOffer();

    await this.pc.setLocalDescription(offer);
    const { sdp, location } = await pullRequest({
      AppID: this.appId,
      StreamID: this.streamId,
      token: this.token,
      SessionID: '',
      sdp: offer.sdp,
    })
    this.location = location;

    await this.pc.setRemoteDescription(
      new RTCSessionDescription({
        type: "answer",
        sdp,
      }),
    );
  }

  async unsubscribe() {
    if (this.pc.connectionState === 'closed') {
      throw new Error('Already unsubscribed.')
    }

    if (!this.location) {
      throw new Error('Not in subscribing. Consider using `subscribe()` before `unsubscribe()`.')
    }

    await deleteRequest(this.location);
    this.location = undefined;
    this.pc.close();
  }

  async mute(muted: boolean, kind?: 'audio' | 'video') {
    if (!this.location) {
      throw new Error('Not in subscribing. Consider using `subscribe()` before `mute()`.')
    }

    if (kind === 'audio' || !kind) {
      this.audioMuted = muted;
    }

    if (kind === 'video' || !kind) {
      this.videoMuted = muted;
    }

    await updateRequest(this.location, {
      MuteAudio: this.audioMuted,
      MuteVideo: this.videoMuted,
    })
  }
}
