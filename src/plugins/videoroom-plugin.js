'use strict';

/**
 * This module contains the implementation of the VideoRoom plugin (ref. {@link https://janus.conf.meetecho.com/docs/videoroom.html}).
 * @module videoroom-plugin
 */

import Handle from '../handle.js';

/* The plugin ID exported in the plugin descriptor */
const PLUGIN_ID = 'janus.plugin.videoroom';

/* These are the requests defined for the Janus VideoRoom API */
const REQUEST_JOIN = 'join';
const REQUEST_CONFIGURE = 'configure';
const REQUEST_JOIN_CONFIGURE = 'joinandconfigure';
const REQUEST_LIST_PARTICIPANTS = 'listparticipants';
const REQUEST_ENABLE_RECORDING = 'enable_recording';
const REQUEST_KICK = 'kick';
const REQUEST_START = 'start';
const REQUEST_PAUSE = 'pause';
const REQUEST_PUBLISH = 'publish';
const REQUEST_UNPUBLISH = 'unpublish';
const REQUEST_LEAVE = 'leave';

const REQUEST_EXISTS = 'exists';
const REQUEST_LIST_ROOMS = 'list';
const REQUEST_CREATE = 'create';
const REQUEST_DESTROY = 'destroy';
const REQUEST_ALLOW = 'allowed';

const REQUEST_RTP_FWD_START = 'rtp_forward';
const REQUEST_RTP_FWD_STOP = 'stop_rtp_forward';
const REQUEST_RTP_FWD_LIST = 'listforwarders';

const PTYPE_PUBLISHER = 'publisher';
const PTYPE_LISTENER = 'subscriber';

/* These are the events/responses that the Janode plugin will manage */
/* Some of them will be exported in the plugin descriptor */
const PLUGIN_EVENT = {
  PUB_JOINED: 'videoroom_joined',
  SUB_JOINED: 'videoroom_subscribed',
  PUB_LIST: 'videoroom_publisher_list',
  PARTICIPANTS_LIST: 'videoroom_participants_list',
  PUB_PEER_JOINED: 'videoroom_publisher_joined',
  STARTED: 'videoroom_started',
  PAUSED: 'videoroom_paused',
  CONFIGURED: 'videoroom_configured',
  SLOW_LINK: 'videoroom_slowlink',
  DISPLAY: 'videoroom_display',
  UNPUBLISHED: 'videoroom_unpublished',
  LEAVING: 'videoroom_leaving',
  UPDATED: 'videoroom_updated',
  KICKED: 'videoroom_kicked',
  RECORDING_ENABLED_STATE: 'videoroom_recording_enabled_state',
  TALKING: 'videoroom_talking',
  SC_SUBSTREAM_LAYER: 'videoroom_sc_substream_layer',
  SC_TEMPORAL_LAYERS: 'videoroom_sc_temporal_layers',
  ALLOWED: 'videoroom_allowed',
  EXISTS: 'videoroom_exists',
  ROOMS_LIST: 'videoroom_list',
  CREATED: 'videoroom_created',
  DESTROYED: 'videoroom_destroyed',
  RTP_FWD_STARTED: 'videoroom_rtp_fwd_started',
  RTP_FWD_STOPPED: 'videoroom_rtp_fwd_stopped',
  RTP_FWD_LIST: 'videoroom_rtp_fwd_list',
  SUCCESS: 'videoroom_success',
  ERROR: 'videoroom_error',
};

/**
 * The class implementing the VideoRoom plugin (ref. {@link https://janus.conf.meetecho.com/docs/videoroom.html}).<br>
 *
 * It extends the base Janode Handle class and overrides the "handleMessage" method.<br>
 *
 * Moreover it defines many methods to support VideoRoom operations.<br>
 *
 * @hideconstructor
 */
class VideoRoomHandle extends Handle {
  /**
   * Create a Janode VideoRoom handle.
   *
   * @param {module:session~Session} session - A reference to the parent session
   * @param {number} id - The handle identifier
   */
  constructor(session, id) {
    super(session, id);

    /**
     * Either the feed identifier assigned to this publisher handle or the publisher's feed in case this handle is a subscriber.
     *
     * @type {number|string}
     */
    this.feed = null;

    /**
     * The identifier of the videoroom the handle has joined.
     *
     * @type {number|string}
     */
    this.room = null;
  }

  /**
   * The custom "handleMessage" needed for handling VideoRoom messages.
   *
   * @private
   * @param {object} janus_message
   * @returns {object} A falsy value for unhandled events, a truthy value for handled events
   */
  handleMessage(janus_message) {
    const { plugindata, jsep, transaction } = janus_message;
    if (plugindata && plugindata.data && plugindata.data.videoroom) {
      /**
       * @type {VideoRoomData}
       */
      const message_data = plugindata.data;
      const { videoroom, error, error_code, room } = message_data;

      /* Prepare an object for the output Janode event */
      const janode_event = {
        /* The name of the resolved event */
        event: null,
        /* The event payload */
        data: {},
      };

      /* Add JSEP data if available */
      if (jsep) janode_event.data.jsep = jsep;
      /* Add room information if available */
      if (room) janode_event.data.room = room;

      /* The plugin will emit an event only if the handle does not own the transaction */
      /* That means that a transaction has already been closed or this is an async event */
      const emit = (this.ownsTransaction(transaction) === false);

      /* Use the "janode" property to store the output event */
      janus_message._janode = janode_event;

      switch (videoroom) {

        /* Success response */
        case 'success':
          /* Room exists API */
          if (typeof message_data.exists !== 'undefined') {
            janode_event.data.exists = message_data.exists;
            janode_event.event = PLUGIN_EVENT.EXISTS;
            break;
          }
          /* Room list API */
          if (typeof message_data.list !== 'undefined') {
            janode_event.data.list = message_data.list;
            janode_event.event = PLUGIN_EVENT.ROOMS_LIST;
            break;
          }
          /* Tokens management (add/remove/enable) */
          if (typeof message_data.allowed !== 'undefined') {
            janode_event.data.list = message_data.allowed;
            janode_event.event = PLUGIN_EVENT.ALLOWED;
            break;
          }
          /* Global recording enabled or disabled */
          if (typeof message_data.record !== 'undefined') {
            janode_event.data.record = message_data.record;
            janode_event.event = PLUGIN_EVENT.RECORDING_ENABLED_STATE;
            break;
          }

          /* Generic success event */
          janode_event.event = PLUGIN_EVENT.SUCCESS;
          break;

        /* Publisher joined */
        case 'joined':
          /* Store room and feed id */
          this.room = room;
          this.feed = message_data.id;

          janode_event.data.feed = message_data.id;
          janode_event.data.description = message_data.description;
          janode_event.data.publishers = message_data.publishers.map(({ id, display, talking }) => {
            const pub = {
              feed: id,
              display,
            };
            if (typeof talking !== 'undefined') pub.talking = talking;
            return pub;
          });
          janode_event.event = PLUGIN_EVENT.PUB_JOINED;
          break;

        /* Subscriber joined */
        case 'attached':
          /* Store room and feed id */
          this.room = room;
          this.feed = message_data.id;

          janode_event.data.feed = message_data.id;
          janode_event.data.display = message_data.display;
          janode_event.event = PLUGIN_EVENT.SUB_JOINED;
          break;

        /* Slow-link event */
        case 'slow_link':
          janode_event.data.feed = this.feed;
          janode_event.data.bitrate = message_data['current-bitrate'];
          janode_event.event = PLUGIN_EVENT.SLOW_LINK;
          break;

        /* Participants list */
        case 'participants':
          janode_event.data.participants = message_data.participants.map(({ id, display, publisher, talking }) => {
            const peer = {
              feed: id,
              display,
              publisher,
            };
            if (typeof talking !== 'undefined') peer.talking = talking;
            return peer;
          });
          janode_event.event = PLUGIN_EVENT.PARTICIPANTS_LIST;
          break;

        /* Room created */
        case 'created':
          janode_event.event = PLUGIN_EVENT.CREATED;
          janode_event.data.permanent = message_data.permanent;
          break;

        /* Room destroyed */
        case 'destroyed':
          janode_event.event = PLUGIN_EVENT.DESTROYED;
          break;

        /* RTP forwarding started */
        case 'rtp_forward':
          janode_event.data.feed = message_data.publisher_id;
          janode_event.data.forwarder = {
            host: message_data.rtp_stream.host,
          };
          if (message_data.rtp_stream.audio) {
            janode_event.data.forwarder.audio_port = message_data.rtp_stream.audio;
            janode_event.data.forwarder.audio_rtcp_port = message_data.rtp_stream.audio_rtcp;
            janode_event.data.forwarder.audio_stream = message_data.rtp_stream.audio_stream_id;
          }
          if (message_data.rtp_stream.video) {
            janode_event.data.forwarder.video_port = message_data.rtp_stream.video;
            janode_event.data.forwarder.video_rtcp_port = message_data.rtp_stream.video_rtcp;
            janode_event.data.forwarder.video_stream = message_data.rtp_stream.video_stream_id;
          }
          if (message_data.rtp_stream.data) {
            janode_event.data.forwarder.data_port = message_data.rtp_stream.data;
            janode_event.data.forwarder.data_stream = message_data.rtp_stream.data_stream_id;
          }
          janode_event.event = PLUGIN_EVENT.RTP_FWD_STARTED;
          break;

        /* RTP forwarding stopped */
        case 'stop_rtp_forward':
          janode_event.data.feed = message_data.publisher_id;
          janode_event.data.stream = message_data.stream_id;
          janode_event.event = PLUGIN_EVENT.RTP_FWD_STOPPED;
          break;

        /* RTP forwarders list */
        case 'forwarders':
          if (janode_event.data.forwarders) {
            janode_event.data.forwarders = message_data.rtp_forwarders.map(({ publisher_id, rtp_forwarder }) => {
              const pub = {
                feed: publisher_id,
              };

              pub.forwarders = rtp_forwarder.map(forw => {
                const forwarder = {
                  host: forw.ip,
                };

                if (forw.audio_stream_id) {
                  forwarder.audio_port = forw.port;
                  forwarder.audio_rtcp_port = forw.remote_rtcp_port;
                  forwarder.audio_stream = forw.audio_stream_id;
                }
                if (forw.video_stream_id) {
                  forwarder.video_port = forw.port;
                  forwarder.video_rtcp_port = forw.remote_rtcp_port;
                  forwarder.video_stream = forw.video_stream_id;
                }
                if (forw.data_stream_id) {
                  forwarder.data_port = forw.port;
                  forwarder.data_stream = forw.data_stream_id;
                }

                return forwarder;
              });

              return pub;
            });
          }
          else if (janode_event.data.publishers) {
            janode_event.data.forwarders = message_data.publishers.map(({ publisher_id, forwarders }) => {
              const pub = {
                feed: publisher_id,
              };

              pub.forwarders = forwarders.map(forw => {
                const forwarder = {
                  host: forw.host,
                };

                if (forw.type === 'audio') {
                  forwarder.audio_port = forw.port;
                  forwarder.audio_rtcp_port = forw.remote_rtcp_port;
                  forwarder.audio_stream = forw.stream_id;
                }
                if (forw.type === 'video') {
                  forwarder.video_port = forw.port;
                  forwarder.video_rtcp_port = forw.remote_rtcp_port;
                  forwarder.video_stream = forw.stream_id;
                  if (typeof forw.substream !== 'undefined') {
                    forwarder.sc_substream_layer = forw.substream;
                  }
                }
                if (forw.type === 'data') {
                  forwarder.data_port = forw.port;
                  forwarder.data_stream = forw.stream_id;
                }

                if (typeof forw.ssrc !== 'undefined')
                  forwarder.ssrc = forw.ssrc;
                if (typeof forw.pt !== 'undefined')
                  forwarder.pt = forw.pt;
                if (typeof forw.srtp !== 'undefined')
                  forwarder.srtp = forw.srtp;

                return forwarder;
              });

              return pub;
            });
          }

          janode_event.event = PLUGIN_EVENT.RTP_FWD_LIST;
          break;

        /* Talking events */
        case 'talking':
        case 'stopped-talking':
          janode_event.data.feed = message_data.id;
          janode_event.data.talking = (videoroom === 'talking');
          janode_event.data.audio_level = message_data['audio-level-dBov-avg'];
          janode_event.event = PLUGIN_EVENT.TALKING;
          break;

        /* [multistream] updated event */
        case 'updated':
          janode_event.data.streams = message_data.streams;
          janode_event.event = PLUGIN_EVENT.UPDATED;
          break;

        /* Generic events (error, notifications ...) */
        case 'event':
          /* VideoRoom Error */
          if (error) {
            janode_event.event = PLUGIN_EVENT.ERROR;
            janode_event.data = new Error(`${error_code} ${error}`);
            janode_event.data._code = error_code;
            /* In case of error, close a transaction */
            this.closeTransactionWithError(transaction, janode_event.data);
            break;
          }
          /* Participant joined notification (notify_joining) */
          if (message_data.joining) {
            janode_event.event = PLUGIN_EVENT.PUB_PEER_JOINED;
            janode_event.data.feed = message_data.joining.id;
            if (message_data.joining.display) janode_event.data.display = message_data.joining.display;
            break;
          }
          /* Publisher list notification */
          if (message_data.publishers) {
            janode_event.event = PLUGIN_EVENT.PUB_LIST;
            janode_event.data.publishers = message_data.publishers.map(({ id, display, talking }) => {
              const pub = {
                feed: id,
                display,
              };
              if (typeof talking !== 'undefined') pub.talking = talking;
              return pub;
            });
            break;
          }
          /* Configuration events (publishing, general configuration) */
          if (typeof message_data.configured !== 'undefined') {
            janode_event.event = PLUGIN_EVENT.CONFIGURED;
            janode_event.data.feed = this.feed;
            janode_event.data.configured = message_data.configured;
            break;
          }
          /* Display name changed event */
          if (typeof message_data.display !== 'undefined') {
            janode_event.event = PLUGIN_EVENT.DISPLAY;
            janode_event.data.feed = message_data.id;
            janode_event.data.display = message_data.display;
            break;
          }
          /* Subscribed feed started */
          if (typeof message_data.started !== 'undefined') {
            janode_event.event = PLUGIN_EVENT.STARTED;
            janode_event.data.feed = this.feed;
            janode_event.data.started = message_data.started;
            break;
          }
          /* Subscribed feed paused */
          if (typeof message_data.paused !== 'undefined') {
            janode_event.event = PLUGIN_EVENT.PAUSED;
            janode_event.data.feed = this.feed;
            janode_event.data.paused = message_data.paused;
            break;
          }
          /* Unpublished own or other feed */
          if (typeof message_data.unpublished !== 'undefined') {
            janode_event.event = PLUGIN_EVENT.UNPUBLISHED;
            janode_event.data.feed = (message_data.unpublished === 'ok') ? this.feed : message_data.unpublished;
            break;
          }
          /* Leaving confirmation */
          if (typeof message_data.leaving !== 'undefined') {
            janode_event.event = PLUGIN_EVENT.LEAVING;
            janode_event.data.feed = (message_data.leaving === 'ok') ? this.feed : message_data.leaving;
            if (message_data.reason) janode_event.data.reason = message_data.reason;
            break;
          }
          /* Participant kicked out */
          if (typeof message_data.kicked !== 'undefined') {
            janode_event.event = PLUGIN_EVENT.KICKED;
            janode_event.data.feed = message_data.kicked;
            break;
          }
          /* Participant left (for subscribers "leave") */
          if (typeof message_data.left !== 'undefined') {
            janode_event.event = PLUGIN_EVENT.LEAVING;
            janode_event.data.feed = this.feed;
            break;
          }
          /* Simulcast substream layer switch */
          if (typeof message_data.substream !== 'undefined') {
            janode_event.event = PLUGIN_EVENT.SC_SUBSTREAM_LAYER;
            janode_event.data.feed = this.feed;
            janode_event.data.sc_substream_layer = message_data.substream;
            break;
          }
          /* Simulcast temporal layers switch */
          if (typeof message_data.temporal !== 'undefined') {
            janode_event.event = PLUGIN_EVENT.SC_TEMPORAL_LAYERS;
            janode_event.data.feed = this.feed;
            janode_event.data.sc_temporal_layers = message_data.temporal;
            break;
          }
      }

      /* The event has been handled */
      if (janode_event.event) {
        /* Try to close the transaction */
        this.closeTransactionWithSuccess(transaction, janus_message);
        /* If the transaction was not owned, emit the event */
        if (emit) this.emit(janode_event.event, janode_event.data);
        return janode_event;
      }
    }

    /* The event has not been handled, return a falsy value */
    return null;
  }

  /*----------*/
  /* USER API */
  /*----------*/

  /* These are the APIs that users need to work with the videoroom plugin */

  /**
   * Join a videoroom as publisher.
   *
   * @param {object} params
   * @param {number|string} params.room - The room to join to
   * @param {number|string} [params.feed] - The feed identifier to use, if missing it is picked by Janus
   * @param {boolean} [params.audio] - True to request audio relaying
   * @param {boolean} [params.video] - True to request video relaying
   * @param {boolean} [params.data] - True to request datachannel relaying
   * @param {string} [params.display] - The display name to use
   * @param {number} [params.bitrate] - Bitrate cap
   * @param {string} [params.token] - The optional token needed to join the room
   * @param {string} [params.pin] - The optional pin needed to join the room
   * @param {boolean} [params.record] - Enable the recording
   * @param {string} [params.filename] - If recording, the base path/file to use for the recording
   * @returns {Promise<module:videoroom-plugin~VIDEOROOM_EVENT_PUB_JOINED>}
   */
  async joinPublisher({ room, feed, audio, video, data, bitrate, record, filename, display, token, pin }) {
    const body = {
      request: REQUEST_JOIN,
      ptype: PTYPE_PUBLISHER,
      room,
    };
    if (typeof feed === 'string' || typeof feed === 'number') body.id = feed;
    if (typeof display === 'string') body.display = display;
    if (typeof audio === 'boolean') body.audio = audio;
    if (typeof video === 'boolean') body.video = video;
    if (typeof data === 'boolean') body.data = data;
    if (typeof bitrate === 'number') body.bitrate = bitrate;
    if (typeof record === 'boolean') body.record = record;
    if (typeof filename === 'string') body.filename = filename;
    if (typeof token === 'string') body.token = token;
    if (typeof pin === 'string') body.pin = pin;

    const response = await this.message(body);
    const { event, data: evtdata } = response._janode || {};
    if (event === PLUGIN_EVENT.PUB_JOINED) {
      if (body.display) evtdata.display = body.display;
      return evtdata;
    }
    const error = new Error(`unexpected response to ${body.request} request`);
    throw (error);
  }

  /**
   * Join and configure videoroom handle as publisher.
   *
   * @param {object} params
   * @param {number|string} params.room - The room to join to
   * @param {number|string} [params.feed] - The feed identifier to use, if missing it is picked by Janus
   * @param {boolean} [params.audio] - True to request audio relaying
   * @param {boolean} [params.video] - True to request video relaying
   * @param {boolean} [params.data] - True to request datachannel relaying
   * @param {string} [params.display] - The display name to use
   * @param {number} [params.bitrate] - Bitrate cap
   * @param {string} [params.token] - The optional token needed to join the room
   * @param {string} [params.pin] - The optional pin needed to join the room
   * @param {boolean} [params.record] - Enable the recording
   * @param {string} [params.filename] - If recording, the base path/file to use for the recording
   * @param {RTCSessionDescription} [params.jsep] - The JSEP offer
   * @returns {Promise<module:videoroom-plugin~VIDEOROOM_EVENT_PUB_JOINED>}
   */
  async joinConfigurePublisher({ room, feed, audio, video, data, bitrate, record, filename, display, token, pin, jsep }) {
    const body = {
      request: REQUEST_JOIN_CONFIGURE,
      ptype: PTYPE_PUBLISHER,
      room,
    };
    if (typeof feed === 'string' || typeof feed === 'number') body.id = feed;
    if (typeof display === 'string') body.display = display;
    if (typeof audio === 'boolean') body.audio = audio;
    if (typeof video === 'boolean') body.video = video;
    if (typeof data === 'boolean') body.data = data;
    if (typeof bitrate === 'number') body.bitrate = bitrate;
    if (typeof record === 'boolean') body.record = record;
    if (typeof filename === 'string') body.filename = filename;
    if (typeof token === 'string') body.token = token;
    if (typeof pin === 'string') body.pin = pin;

    const response = await this.message(body, jsep).catch(e => {
      /* Cleanup the WebRTC status in Janus in case of errors when publishing */
      /*
       *
       * JANUS_VIDEOROOM_ERROR_NO_SUCH_FEED       428
       * JANUS_VIDEOROOM_ERROR_MISSING_ELEMENT    429
       * JANUS_VIDEOROOM_ERROR_INVALID_ELEMENT    430
       * JANUS_VIDEOROOM_ERROR_INVALID_SDP_TYPE   431
       * JANUS_VIDEOROOM_ERROR_PUBLISHERS_FULL    432
       * JANUS_VIDEOROOM_ERROR_UNAUTHORIZED       433
       * JANUS_VIDEOROOM_ERROR_ALREADY_PUBLISHED  434
       * JANUS_VIDEOROOM_ERROR_NOT_PUBLISHED      435
       * JANUS_VIDEOROOM_ERROR_ID_EXISTS          436
       * JANUS_VIDEOROOM_ERROR_INVALID_SDP        437
       *
       */
      if (jsep && e._code && e._code >= 429 && e._code <= 437 && e._code != 434)
        this.hangup().catch(() => { });
      throw e;
    });

    const { event, data: evtdata } = response._janode || {};
    if (event === PLUGIN_EVENT.PUB_JOINED) {
      if (body.display) evtdata.display = body.display;
      return evtdata;
    }
    const error = new Error(`unexpected response to ${body.request} request`);
    throw (error);
  }

  /**
   * Configure a publisher or subscriber handle.<br>
   * Room is detected from the context since a handle must have joined before.<br>
   * Can also be used by publishers to publish a feed.<br>
   *
   * Use this API also to trigger ICE restarts. Publishers can omit the
   * restart/update flags, while subscribers need to use them to force
   * the operation.
   *
   * @param {object} params
   * @param {boolean} [params.audio] - True to request audio relaying
   * @param {boolean} [params.video] - True to request video relaying
   * @param {boolean} [params.data] - True to request datachannel relaying
   * @param {string} [params.display] - The display name to use (publishers only)
   * @param {number} [params.bitrate] - Bitrate cap (publishers only)
   * @param {boolean} [params.record] - True to record the feed (publishers only)
   * @param {string} [params.filename] - If recording, the base path/file to use for the recording (publishers only)
   * @param {boolean} [params.restart] - Set to force a ICE restart
   * @param {boolean} [params.update] - Set to force a renegotiation
   * @param {number} [params.sc_substream_layer] - Substream layer to receive (0-2), in case simulcasting is enabled (subscribers only)
   * @param {number} [params.sc_substream_fallback_ms] - How much time in ms without receiving packets will make janus drop to the substream below (subscribers only)
   * @param {number} [params.sc_temporal_layers] - Temporal layers to receive (0-2), in case VP8 simulcasting is enabled (subscribers only)
   * @param {RTCSessionDescription} [params.jsep] - The JSEP offer (publishers only)
   * @returns {Promise<module:videoroom-plugin~VIDEOROOM_EVENT_CONFIGURED>}
   */
  async configure({ audio, video, data, bitrate, record, filename, display, restart, update, sc_substream_layer, sc_substream_fallback_ms, sc_temporal_layers, jsep }) {
    const body = {
      request: REQUEST_CONFIGURE,
    };
    if (typeof audio === 'boolean') body.audio = audio;
    if (typeof video === 'boolean') body.video = video;
    if (typeof data === 'boolean') body.data = data;
    if (typeof bitrate === 'number') body.bitrate = bitrate;
    if (typeof record === 'boolean') body.record = record;
    if (typeof filename === 'string') body.filename = filename;
    if (typeof display === 'string') body.display = display;
    if (typeof restart === 'boolean') body.restart = restart;
    if (typeof update === 'boolean') body.update = update;
    if (typeof sc_substream_layer === 'number') body.substream = sc_substream_layer;
    if (typeof sc_substream_fallback_ms === 'number') body.fallback = 1000 * sc_substream_fallback_ms;
    if (typeof sc_temporal_layers === 'number') body.temporal = sc_temporal_layers;

    const response = await this.message(body, jsep).catch(e => {
      /* Cleanup the WebRTC status in Janus in case of errors when publishing */
      /*
       *
       * JANUS_VIDEOROOM_ERROR_NO_SUCH_FEED       428
       * JANUS_VIDEOROOM_ERROR_MISSING_ELEMENT    429
       * JANUS_VIDEOROOM_ERROR_INVALID_ELEMENT    430
       * JANUS_VIDEOROOM_ERROR_INVALID_SDP_TYPE   431
       * JANUS_VIDEOROOM_ERROR_PUBLISHERS_FULL    432
       * JANUS_VIDEOROOM_ERROR_UNAUTHORIZED       433
       * JANUS_VIDEOROOM_ERROR_ALREADY_PUBLISHED  434
       * JANUS_VIDEOROOM_ERROR_NOT_PUBLISHED      435
       * JANUS_VIDEOROOM_ERROR_ID_EXISTS          436
       * JANUS_VIDEOROOM_ERROR_INVALID_SDP        437
       *
       */
      if (jsep && e._code && e._code >= 429 && e._code <= 437 && e._code != 434)
        this.hangup().catch(() => { });
      throw e;
    });

    const { event, data: evtdata } = response._janode || {};
    if (event === PLUGIN_EVENT.CONFIGURED && evtdata.configured === 'ok') {
      if (body.display) evtdata.display = body.display;
      if (typeof body.request === 'boolean') evtdata.restart = body.restart;
      if (typeof body.update === 'boolean') evtdata.update = body.update;
      return evtdata;
    }
    const error = new Error(`unexpected response to ${body.request} request`);
    throw (error);
  }

  /**
   * Publish a feed in the room.
   * Room is detected from the context since a handle must have joined before.
   *
   * @param {object} params
   * @param {boolean} [params.audio] - True to request audio relaying
   * @param {boolean} [params.video] - True to request video relaying
   * @param {boolean} [params.data] - True to request datachannel relaying
   * @param {string} [params.display] - The display name to use
   * @param {number} [params.bitrate] - Bitrate cap
   * @param {boolean} [params.record] - True to record the feed
   * @param {string} [params.filename] - If recording, the base path/file to use for the recording
   * @param {RTCSessionDescription} params.jsep - The JSEP offer
   * @returns {Promise<module:videoroom-plugin~VIDEOROOM_EVENT_CONFIGURED>}
   */
  async publish({ audio, video, data, bitrate, record, filename, display, jsep }) {
    if (typeof jsep === 'object' && jsep && jsep.type !== 'offer') {
      const error = new Error('jsep must be an offer');
      return Promise.reject(error);
    }
    const body = {
      request: REQUEST_PUBLISH,
    };
    if (typeof audio === 'boolean') body.audio = audio;
    if (typeof video === 'boolean') body.video = video;
    if (typeof data === 'boolean') body.data = data;
    if (typeof bitrate === 'number') body.bitrate = bitrate;
    if (typeof record === 'boolean') body.record = record;
    if (typeof filename === 'string') body.filename = filename;
    if (typeof display === 'string') body.display = display;

    const response = await this.message(body, jsep).catch(e => {
      /* Cleanup the WebRTC status in Janus in case of errors when publishing */
      /*
       *
       * JANUS_VIDEOROOM_ERROR_NO_SUCH_FEED       428
       * JANUS_VIDEOROOM_ERROR_MISSING_ELEMENT    429
       * JANUS_VIDEOROOM_ERROR_INVALID_ELEMENT    430
       * JANUS_VIDEOROOM_ERROR_INVALID_SDP_TYPE   431
       * JANUS_VIDEOROOM_ERROR_PUBLISHERS_FULL    432
       * JANUS_VIDEOROOM_ERROR_UNAUTHORIZED       433
       * JANUS_VIDEOROOM_ERROR_ALREADY_PUBLISHED  434
       * JANUS_VIDEOROOM_ERROR_NOT_PUBLISHED      435
       * JANUS_VIDEOROOM_ERROR_ID_EXISTS          436
       * JANUS_VIDEOROOM_ERROR_INVALID_SDP        437
       *
       */
      if (jsep && e._code && e._code >= 429 && e._code <= 437 && e._code != 434)
        this.hangup().catch(() => { });
      throw e;
    });

    const { event, data: evtdata } = response._janode || {};
    if (event === PLUGIN_EVENT.CONFIGURED && evtdata.configured === 'ok') {
      if (body.display) evtdata.display = body.display;
      return evtdata;
    }
    const error = new Error(`unexpected response to ${body.request} request`);
    throw (error);
  }

  /**
   * Unpublish a feed in the room.
   *
   * @returns {Promise<module:videoroom-plugin~VIDEOROOM_EVENT_UNPUBLISHED>}
   */
  async unpublish() {
    const body = {
      request: REQUEST_UNPUBLISH,
    };

    const response = await this.message(body);
    const { event, data: evtdata } = response._janode || {};
    if (event === PLUGIN_EVENT.UNPUBLISHED)
      return evtdata;
    const error = new Error(`unexpected response to ${body.request} request`);
    throw (error);
  }

  /**
   * Join a room as subscriber.
   *
   * @param {object} params
   * @param {number|string} params.room - The room to join
   * @param {number|string} [params.feed=0] - The feed the user wants to subscribe to
   * @param {boolean} [params.audio] - True to subscribe to the audio feed
   * @param {boolean} [params.video] - True to subscribe to the video feed
   * @param {boolean} [params.data] - True to subscribe to the datachannels of the feed
   * @param {number} [params.sc_substream_layer] - Substream layer to receive (0-2), in case simulcasting is enabled
   * @param {number} [params.sc_substream_fallback_ms] - How much time in ms without receiving packets will make janus drop to the substream below
   * @param {number} [params.sc_temporal_layers] - Temporal layers to receive (0-2), in case VP8 simulcasting is enabled
   * @param {string} [params.token] - The optional token needed
   * @returns {Promise<module:videoroom-plugin~VIDEOROOM_EVENT_SUB_JOINED>}
   */
  async joinSubscriber({ room, feed, audio, video, data, sc_substream_layer, sc_substream_fallback_ms, sc_temporal_layers, token }) {
    const body = {
      request: REQUEST_JOIN,
      ptype: PTYPE_LISTENER,
      room,
      feed,
    };
    if (typeof audio === 'boolean') body.audio = audio;
    if (typeof video === 'boolean') body.video = video;
    if (typeof data === 'boolean') body.data = data;
    if (typeof token === 'string') body.token = token;
    if (typeof sc_substream_layer === 'number') body.substream = sc_substream_layer;
    if (typeof sc_substream_fallback_ms === 'number') body.fallback = 1000 * sc_substream_fallback_ms;
    if (typeof sc_temporal_layers === 'number') body.temporal = sc_temporal_layers;

    const response = await this.message(body);
    const { event, data: evtdata } = response._janode || {};
    if (event === PLUGIN_EVENT.SUB_JOINED)
      return evtdata;
    const error = new Error(`unexpected response to ${body.request} request`);
    throw (error);
  }

  /**
   * Alias for "joinSubscriber".
   *
   * @see module:videoroom-plugin~VideoRoomHandle#joinSubscriber
   */
  async joinListener(params) {
    return this.joinSubscriber(params);
  }

  /**
   * Start a subscriber stream.
   *
   * @param {object} params
   * @param {RTCSessionDescription} params.jsep - The JSEP answer
   * @returns {Promise<module:videoroom-plugin~VIDEOROOM_EVENT_STARTED>}
   */
  async start({ jsep }) {
    const body = {
      request: REQUEST_START,
    };

    const response = await this.message(body, jsep);
    const { event, data: evtdata } = response._janode || {};
    if (event === PLUGIN_EVENT.STARTED && evtdata.started === 'ok')
      return evtdata;
    const error = new Error(`unexpected response to ${body.request} request`);
    throw (error);
  }

  /**
   * Pause a subscriber feed.
   *
   * @returns {Promise<module:videoroom-plugin~VIDEOROOM_EVENT_PAUSED>}
   */
  async pause() {
    const body = {
      request: REQUEST_PAUSE,
    };

    const response = await this.message(body);
    const { event, data: evtdata } = response._janode || {};
    if (event === PLUGIN_EVENT.PAUSED && evtdata.paused === 'ok')
      return evtdata;
    const error = new Error(`unexpected response to ${body.request} request`);
    throw (error);
  }

  /**
   * Leave a room.
   * Can be used by both publishers and subscribers.
   *
   * @returns {Promise<module:videoroom-plugin~VIDEOROOM_EVENT_LEAVING>}
   */
  async leave() {
    const body = {
      request: REQUEST_LEAVE,
    };

    const response = await this.message(body);
    const { event, data: evtdata } = response._janode || {};
    if (event === PLUGIN_EVENT.LEAVING)
      return evtdata;
    const error = new Error(`unexpected response to ${body.request} request`);
    throw (error);
  }

  /*----------------*/
  /* Management API */
  /*----------------*/

  /* These are the APIs needed to manage videoroom resources (rooms, forwarders ...) */

  /**
   * List the participants inside a room.
   *
   * @param {object} params
   * @param {number|string} params.room - The room where the list is being requested
   * @param {string} params.secret - The optional secret for the operation
   * @returns {Promise<module:videoroom-plugin~VIDEOROOM_EVENT_PARTICIPANTS_LIST>}
   */
  async listParticipants({ room, secret }) {
    const body = {
      request: REQUEST_LIST_PARTICIPANTS,
      room,
    };
    if (typeof secret === 'string') body.secret = secret;

    const response = await this.message(body);
    const { event, data: evtdata } = response._janode || {};
    if (event === PLUGIN_EVENT.PARTICIPANTS_LIST)
      return evtdata;
    const error = new Error(`unexpected response to ${body.request} request`);
    throw (error);
  }

  /**
   * Enable or disable recording for all participants in a room while the conference is in progress.
   *
   * @param {object} params
   * @param {number|string} params.room - The room where the change of recording state is being requested
   * @param {string} params.secret - The optional secret for the operation
   * @param {boolean} params.record - True starts recording for all participants in an already running conference, false stops the recording
   * @returns {Promise<module:videoroom-plugin~VIDEOROOM_EVENT_RECORDING_ENABLED_STATE>}
   */
  async enable_recording({ room, secret , record}) {
    const body = {
      request: REQUEST_ENABLE_RECORDING,
      room,
      record
    };
    if (typeof secret === 'string') body.secret = secret;

    const response = await this.message(body);
    const { event, data: evtdata } = response._janode || {};
    if (event === PLUGIN_EVENT.RECORDING_ENABLED_STATE) {
      evtdata.room = body.room;
      return evtdata;
    }
    const error = new Error(`unexpected response to ${body.request} request`);
    throw (error);
  }

  /**
   * Kick a publisher out from a room.
   *
   * @param {object} params
   * @param {number|string} params.room - The room where the kick is being requested
   * @param {number|string} params.feed - The identifier of the feed to kick out
   * @param {string} params.secret - The optional secret for the operation
   * @returns {Promise<module:videoroom-plugin~VIDEOROOM_EVENT_KICKED>}
   */
  async kick({ room, feed, secret }) {
    const body = {
      request: REQUEST_KICK,
      room,
      id: feed,
    };
    if (typeof secret === 'string') body.secret = secret;

    const response = await this.message(body);
    const { event, data: evtdata } = response._janode || {};
    if (event === PLUGIN_EVENT.SUCCESS) {
      evtdata.room = body.room;
      evtdata.feed = body.id;
      return evtdata;
    }
    const error = new Error(`unexpected response to ${body.request} request`);
    throw (error);
  }

  /**
   * Check if a room exists.
   *
   * @param {object} params
   * @param {number|string} params.room - The room to check
   * @returns {Promise<module:videoroom-plugin~VIDEOROOM_EVENT_EXISTS>}
   */
  async exists({ room }) {
    const body = {
      request: REQUEST_EXISTS,
      room,
    };

    const response = await this.message(body);
    const { event, data: evtdata } = response._janode || {};
    if (event === PLUGIN_EVENT.EXISTS)
      return evtdata;
    const error = new Error(`unexpected response to ${body.request} request`);
    throw (error);
  }

  /**
   * List all the available rooms.
   *
   * @returns {Promise<module:videoroom-plugin~VIDEOROOM_EVENT_LIST>}
   */
  async list() {
    const body = {
      request: REQUEST_LIST_ROOMS,
    };

    const response = await this.message(body);
    const { event, data: evtdata } = response._janode || {};
    if (event === PLUGIN_EVENT.ROOMS_LIST)
      return evtdata;
    const error = new Error(`unexpected response to ${body.request} request`);
    throw (error);
  }

  /**
   * Create a new room.
   *
   * @param {object} params
   * @param {number|string} [params.room] - The room identifier, if missing picked by janus
   * @param {string} [params.description] - A textual description of the room
   * @param {number} [params.max_publishers] - The max number of publishers allowed
   * @param {boolean} [params.permanent] - True to make Janus persist the room on th config file
   * @param {boolean} [params.is_private] - Make the room private (hidden from listing)
   * @param {string} [params.secret] - The secret that will be used to modify the room
   * @param {string} [params.pin] - The pin needed to access the room
   * @param {number} [params.bitrate] - The bitrate cap that will be used for publishers
   * @param {boolean} [params.bitrate_cap] - Make the bitrate cap an insormountable limit
   * @param {number} [params.fir_freq] - The PLI interval in seconds
   * @param {string} [params.audiocodec] - Comma separated list of allowed audio codecs
   * @param {string} [params.videocodec] - Comma separated list of allowed video codecs
   * @param {boolean} [params.talking_events] - True to enable talking events
   * @param {number} [params.talking_level_threshold] - Audio level threshold for talking events in the range [0, 127]
   * @param {number} [params.talking_packets_threshold] - Audio packets threshold for talking events
   * @param {boolean} [params.record] - Wheter to enable recording of any publisher
   * @param {string} [params.rec_dir] - Folder where recordings should be stored
   * @param {boolean} [params.videoorient] - Whether the video-orientation RTP extension must be negotiated
   * @param {string} [params.h264_profile] - H264 specific profile to prefer
   * @returns {Promise<module:videoroom-plugin~VIDEOROOM_EVENT_CREATED>}
   */
  async create({ room, description, max_publishers, permanent, is_private, secret, pin, bitrate,
    bitrate_cap, fir_freq, audiocodec, videocodec, talking_events, talking_level_threshold, talking_packets_threshold, record, rec_dir, videoorient, h264_profile }) {
    const body = {
      request: REQUEST_CREATE,
    };
    if (typeof room === 'string' || typeof room === 'number') body.room = room;
    if (typeof description === 'string') body.description = description;
    if (typeof max_publishers === 'number') body.publishers = max_publishers;
    if (typeof permanent === 'boolean') body.permanent = permanent;
    if (typeof is_private === 'boolean') body.is_private = is_private;
    if (typeof secret === 'string') body.secret = secret;
    if (typeof pin === 'string') body.pin = pin;
    if (typeof bitrate === 'number') body.bitrate = bitrate;
    if (typeof bitrate_cap === 'boolean') body.bitrate_cap = bitrate_cap;
    if (typeof fir_freq === 'number') body.fir_freq = fir_freq;
    if (typeof audiocodec === 'string') body.audiocodec = audiocodec;
    if (typeof videocodec === 'string') body.videocodec = videocodec;
    if (typeof talking_events === 'boolean') body.audiolevel_event = talking_events;
    if (typeof talking_level_threshold === 'number' && talking_level_threshold >= 0 && talking_level_threshold <= 127) body.audio_level_average = talking_level_threshold;
    if (typeof talking_packets_threshold === 'number' && talking_packets_threshold > 0) body.audio_active_packets = talking_packets_threshold;
    if (typeof record === 'boolean') body.record = record;
    if (typeof rec_dir === 'string') body.rec_dir = rec_dir;
    if (typeof videoorient === 'boolean') body.videoorient_ext = videoorient;
    if (typeof h264_profile === 'string') body.h264_profile = h264_profile;

    const response = await this.message(body);
    const { event, data: evtdata } = response._janode || {};
    if (event === PLUGIN_EVENT.CREATED)
      return evtdata;
    const error = new Error(`unexpected response to ${body.request} request`);
    throw (error);
  }

  /**
   * Destroy a room.
   *
   * @param {object} params
   * @param {number|string} params.room - The room to destroy
   * @param {boolean} [params.permanent] - True to remove the room from the Janus config file
   * @param {string} [params.secret] - The secret needed to manage the room
   * @returns {Promise<module:videoroom-plugin~VIDEOROOM_EVENT_DESTROYED>}
   */
  async destroy({ room, permanent, secret }) {
    const body = {
      request: REQUEST_DESTROY,
      room,
    };
    if (typeof permanent === 'boolean') body.permanent = permanent;
    if (typeof secret === 'string') body.secret = secret;

    const response = await this.message(body);
    const { event, data: evtdata } = response._janode || {};
    if (event === PLUGIN_EVENT.DESTROYED)
      return evtdata;
    const error = new Error(`unexpected response to ${body.request} request`);
    throw (error);
  }

  /**
   * Edit the ACL tokens for a room.
   *
   * @param {object} params
   * @param {number|string} params.room - The room where to change the acl
   * @param {"enable"|"disable"|"add"|"remove"} params.action - The action to execute on the acl
   * @param {string[]} params.list - The list of tokens to execute the action onto
   * @param {string} [params.secret] - The secret needed to manage the room
   * @returns {Promise<module:videoroom-plugin~VIDEOROOM_EVENT_ALLOWED>}
   */
  async allow({ room, action, list, secret }) {
    const body = {
      request: REQUEST_ALLOW,
      room,
      action,
    };
    if (list && list.length > 0) body.allowed = list;
    if (typeof secret === 'string') body.secret = secret;

    const response = await this.message(body);
    const { event, data: evtdata } = response._janode || {};
    if (event === PLUGIN_EVENT.ALLOWED)
      return evtdata;
    const error = new Error(`unexpected response to ${body.request} request`);
    throw (error);
  }

  /**
   * Start a RTP forwarding in a room.
   *
   * @param {object} params
   * @param {number|string} params.room - The room where to start a forwarder
   * @param {number|string} params.feed - The feed identifier to forward (must be published)
   * @param {string} params.host - The target host for the forwarder
   * @param {number} [params.audio_port] - The target audio RTP port, if audio is to be forwarded
   * @param {number} [params.audio_rtcp_port] - The target audio RTCP port, if audio is to be forwarded
   * @param {number} [params.audio_ssrc] - The SSRC that will be used for audio RTP
   * @param {number} [params.video_port] - The target video RTP port, if video is to be forwarded
   * @param {number} [params.video_rtcp_port] - The target video RTCP port, if video is to be forwarded
   * @param {number} [params.video_ssrc] - The SSRC that will be used for video RTP
   * @param {number} [params.data_port] - The target datachannels port, if datachannels are to be forwarded
   * @param {string} [params.secret] - The secret needed for managing the room
   * @param {string} [params.admin_key] - The admin key needed for invoking the API
   * @returns {Promise<module:videoroom-plugin~VIDEOROOM_EVENT_RTP_FWD_STARTED>}
   */
  async startForward({ room, feed, host, audio_port, audio_rtcp_port, audio_ssrc, video_port, video_rtcp_port, video_ssrc, data_port, secret, admin_key }) {
    const body = {
      request: REQUEST_RTP_FWD_START,
      room,
      publisher_id: feed,
    };
    if (typeof host === 'string') body.host = host;
    if (typeof audio_port === 'number') body.audio_port = audio_port;
    if (typeof audio_rtcp_port === 'number') body.audio_rtcp_port = audio_rtcp_port;
    if (typeof audio_ssrc === 'number') body.audio_ssrc = audio_ssrc;
    if (typeof video_port === 'number') body.video_port = video_port;
    if (typeof video_rtcp_port === 'number') body.video_rtcp_port = video_rtcp_port;
    if (typeof video_ssrc === 'number') body.video_ssrc = video_ssrc;
    if (typeof data_port === 'number') body.data_port = data_port;
    if (typeof secret === 'string') body.secret = secret;
    if (typeof admin_key === 'string') body.admin_key = admin_key;

    const response = await this.message(body);
    const { event, data: evtdata } = response._janode || {};
    if (event === PLUGIN_EVENT.RTP_FWD_STARTED)
      return evtdata;
    const error = new Error(`unexpected response to ${body.request} request`);
    throw (error);
  }

  /**
   * Stop a RTP forwarder in a room.
   *
   * @param {object} params
   * @param {number|string} params.room - The room where to stop a forwarder
   * @param {number|string} params.feed - The feed identifier for the forwarder to stop (must be published)
   * @param {number|string} params.stream - The forwarder identifier as returned by the start forward API
   * @param {string} [params.secret] - The secret needed for managing the room
   * @returns {Promise<module:videoroom-plugin~VIDEOROOM_EVENT_RTP_FWD_STOPPED>}
   */
  async stopForward({ room, feed, stream, secret }) {
    const body = {
      request: REQUEST_RTP_FWD_STOP,
      room,
      publisher_id: feed,
      stream_id: stream,
    };
    if (typeof secret === 'string') body.secret = secret;

    const response = await this.message(body);
    const { event, data: evtdata } = response._janode || {};
    if (event === PLUGIN_EVENT.RTP_FWD_STOPPED)
      return evtdata;
    const error = new Error(`unexpected response to ${body.request} request`);
    throw (error);
  }

  /**
   * List the active forwarders in a room.
   *
   * @param {object} params
   * @param {number|string} params.room - The room where to list the forwarders
   * @param {string} [params.secret] - The secret needed for managing the room
   * @returns {Promise<module:videoroom-plugin~VIDEOROOM_EVENT_RTP_FWD_LIST>}
   */
  async listForward({ room, secret }) {
    const body = {
      request: REQUEST_RTP_FWD_LIST,
      room,
    };
    if (typeof secret === 'string') body.secret = secret;

    const response = await this.message(body);
    const { event, data: evtdata } = response._janode || {};
    if (event === PLUGIN_EVENT.RTP_FWD_LIST)
      return evtdata;
    const error = new Error(`unexpected response to ${body.request} request`);
    throw (error);
  }

}

/**
 * The payload of the plugin message (cfr. Janus docs).
 * {@link https://janus.conf.meetecho.com/docs/videoroom.html}
 *
 * @private
 * @typedef {object} VideoRoomData
 */

/**
 * The response event when a publisher has joined.
 *
 * @typedef {object} VIDEOROOM_EVENT_PUB_JOINED
 * @property {number|string} room - The involved room
 * @property {number|string} feed - The feed identifier
 * @property {string} [display] - The dsplay name, if available
 * @property {string} description - A description of the room, if available
 * @property {object[]} publishers - The list of active publishers
 * @property {number|string} publishers[].feed - The feed of an active publisher
 * @property {string} publishers[].display - The display name of an active publisher
 * @property {RTCSessionDescription} [jsep] - The JSEP answer
 */

/**
 * The response event when a subscriber has joined.
 *
 * @typedef {object} VIDEOROOM_EVENT_SUB_JOINED
 * @property {number|string} room - The involved room
 * @property {number|string} feed - The published feed identifier
 * @property {string} display - The published feed display name
 */

/**
 * The response event to a participant list request.
 *
 * @typedef {object} VIDEOROOM_EVENT_PARTICIPANTS_LIST
 * @property {number|string} room - The involved room
 * @property {number|string} feed - The current published feed
 * @property {object[]} participants - The list of current participants
 * @property {number|string} participants[].feed - Feed identifier of the participant
 * @property {string} [participants[].display] - The participant display name, if available
 * @property {boolean} participants[].publisher - Whether the user is an active publisher in the room
 * @property {boolean} [participants[].talking] - True if participant is talking
 */

/**
 * The response event for room create request.
 *
 * @typedef {object} VIDEOROOM_EVENT_CREATED
 * @property {number|string} room - The created room
 * @property {boolean} permanent - True if the room has been persisted on the Janus configuratin file
 */

/**
 * The response event for room destroy request.
 *
 * @typedef {object} VIDEOROOM_EVENT_DESTROYED
 * @property {number|string} room - The destroyed room
 * @property {boolean} permanent - True if the room has been removed from the Janus configuratin file
 */

/**
 * The response event for room exists request.
 *
 * @typedef {object} VIDEOROOM_EVENT_EXISTS
 * @property {number|string} room - The queried room
 */

/**
 * Descriptrion of an active RTP forwarder.
 *
 * @typedef {object} RtpForwarder
 * @property {string} host - The target host
 * @property {number} [audio_port] - The RTP audio target port
 * @property {number} [audio_rtcp_port] - The RTCP audio target port
 * @property {number} [audio_stream] - The audio forwarder identifier
 * @property {number} [video_port] - The RTP video target port
 * @property {number} [video_rtcp_port] - The RTCP video target port
 * @property {number} [video_stream] - The video forwarder identifier
 * @property {number} [data_port] - The datachannels target port
 * @property {number} [data_stream] - The datachannels forwarder identifier
 * @property {number} [ssrc] - SSRC this forwarder is using
 * @property {number} [pt] - payload type this forwarder is using
 * @property {number} [sc_substream_layer] - video simulcast substream this video forwarder is relaying
 * @property {boolean} [srtp] - whether the RTP stream is encrypted
 */

/**
 * The response event for RTP forward start request.
 *
 * @typedef {object} VIDEOROOM_EVENT_RTP_FWD_STARTED
 * @property {number|string} room - The involved room
 * @property {RtpForwarder} forwarder - The forwarder object
 */

/**
 * The response event for RTP forward stop request.
 *
 * @typedef {object} VIDEOROOM_EVENT_RTP_FWD_STOPPED
 * @property {number|string} room - The involved room
 * @property {number|string} feed - The feed identifier being forwarded
 * @property {number} stream - The forwarder identifier
 */

/**
 * The response event for RTP forwarders list request.
 *
 * @typedef {object} VIDEOROOM_EVENT_RTP_FWD_LIST
 * @property {number|string} room - The involved room
 * @property {object[]} forwarders - The list of forwarders
 * @property {number|string} forwarders[].feed - The feed that is being forwarded
 * @property {RtpForwarder[]} forwarders[].forwarders -The list of the forwarders for this feed
 */

/**
 * The response event for videoroom list request.
 *
 * @typedef {object} VIDEOROOM_EVENT_LIST
 * @property {object[]} list - The list of the room as returned by Janus
 */

/**
 * The response event for ACL tokens edit (allowed) request.
 *
 * @typedef {object} VIDEOROOM_EVENT_ALLOWED
 * @property {string[]} list - The updated, complete, list of allowed tokens
 */

/**
 * The response event for publisher/subscriber configure request.
 *
 * @typedef {object} VIDEOROOM_EVENT_CONFIGURED
 * @property {number|string} room - The involved room
 * @property {number|string} feed - The feed identifier
 * @property {string} [display] - The display name, if available
 * @property {boolean} [restart] - True if the request had it true
 * @property {boolean} [update] - True if the request had it true
 * @property {string} configured - A string with the value returned by Janus
 * @property {RTCSessionDescription} [jsep] - The JSEP answer
 */

/**
 * The response event for subscriber start request.
 *
 * @typedef {object} VIDEOROOM_EVENT_STARTED
 * @property {number|string} room - The involved room
 * @property {number|string} feed - The feed that started
 * @property {string} started - A string with the value returned by Janus
 */

/**
 * The response event for subscriber pause request.
 *
 * @typedef {object} VIDEOROOM_EVENT_PAUSED
 * @property {number|string} room - The involved room
 * @property {number|string} feed - The feed that has been paused
 * @property {string} paused - A string with the value returned by Janus
 */

/**
 * The response event for publisher unpublish request.
 *
 * @typedef {object} VIDEOROOM_EVENT_UNPUBLISHED
 * @property {number|string} room - The involved room
 * @property {number|string} feed - The feed that unpublished
 */

/**
 * The response event for publiher/subscriber leave request.
 *
 * @typedef {object} VIDEOROOM_EVENT_LEAVING
 * @property {number|string} room - The involved room
 * @property {number|string} feed - The feed that left
 * @property {string} [reason] - An optional string with the reason of the leaving
 */

/**
 * The response event for the kick request.
 *
 * @typedef {object} VIDEOROOM_EVENT_KICKED
 * @property {number|string} room - The involved room
 * @property {number|string} feed - The feed that has been kicked
 */

/**
 * The response event for the recording enabled request.
 *
 * @typedef {object} VIDEOROOM_EVENT_RECORDING_ENABLED_STATE
 * @property {number|string} room - The involved room
 * @property {boolean} recording - Whether or not the room recording is now enabled
 */

/**
 * The exported plugin descriptor.
 *
 * @type {object}
 * @property {string} id - The plugin identifier used when attaching to Janus
 * @property {module:videoroom-plugin~VideoRoomHandle} Handle - The custom class implementing the plugin
 * @property {object} EVENT - The events emitted by the plugin
 * @property {string} EVENT.VIDEOROOM_PUB_PEER_JOINED {@link module:videoroom-plugin~VIDEOROOM_PUB_PEER_JOINED}
 * @property {string} EVENT.VIDEOROOM_PUB_LIST {@link module:videoroom-plugin~VIDEOROOM_PUB_LIST}
 * @property {string} EVENT.VIDEOROOM_DESTROYED {@link module:videoroom-plugin~VIDEOROOM_DESTROYED}
 * @property {string} EVENT.VIDEOROOM_UNPUBLISHED {@link module:videoroom-plugin~VIDEOROOM_UNPUBLISHED}
 * @property {string} EVENT.VIDEOROOM_LEAVING {@link module:videoroom-plugin~VIDEOROOM_LEAVING}
 * @property {string} EVENT.VIDEOROOM_DISPLAY {@link module:videoroom-plugin~VIDEOROOM_DISPLAY}
 * @property {string} EVENT.VIDEOROOM_KICKED {@link module:videoroom-plugin~VIDEOROOM_KICKED}
 * @property {string} EVENT.VIDEOROOM_RECORDING_ENABLED_STATE {@link module:videoroom-plugin~VIDEOROOM_RECORDING_ENABLED_STATE}
 * @property {string} EVENT.VIDEOROOM_TALKING {@link module:videoroom-plugin~VIDEOROOM_TALKING}
 * @property {string} EVENT.VIDEOROOM_ERROR {@link module:videoroom-plugin~VIDEOROOM_ERROR}
 */
export default {
  id: PLUGIN_ID,
  Handle: VideoRoomHandle,
  EVENT: {
    /**
     * A peer has joined theh room (notify-joining).
     *
     * @event module:videoroom-plugin~VideoRoomHandle#event:VIDEOROOM_PUB_PEER_JOINED
     * @type {object}
     * @property {number|string} room - The involved room
     * @property {number|string} feed - The feed identifier that joined
     * @property {string} display - The display name of the peer
     */
    VIDEOROOM_PUB_PEER_JOINED: PLUGIN_EVENT.PUB_PEER_JOINED,

    /**
     * Active publishers list updated.
     *
     * @event module:videoroom-plugin~VideoRoomHandle#event:VIDEOROOM_PUB_LIST
     * @type {object}
     * @property {number|string} room - The involved room
     * @property {number|string} feed - The current feed identifier
     * @property {object[]} publishers - List of the new publishers
     * @property {number|string} publishers[].feed - Feed identifier of the new publisher
     * @property {string} publishers[].display - Display name of the new publisher
     */
    VIDEOROOM_PUB_LIST: PLUGIN_EVENT.PUB_LIST,

    /**
     * The videoroom has been destroyed.
     *
     * @event module:videoroom-plugin~VideoRoomHandle#event:VIDEOROOM_DESTROYED
     * @type {module:videoroom-plugin~VIDEOROOM_EVENT_DESTROYED}
     */
    VIDEOROOM_DESTROYED: PLUGIN_EVENT.DESTROYED,

    /**
     * A feed has been unpublished.
     *
     * @event module:videoroom-plugin~VideoRoomHandle#event:VIDEOROOM_UNPUBLISHED
     * @type {module:videoroom-plugin~VIDEOROOM_EVENT_UNPUBLISHED}
     */
    VIDEOROOM_UNPUBLISHED: PLUGIN_EVENT.UNPUBLISHED,

    /**
     * A peer has left the room.
     *
     * @event module:videoroom-plugin~VideoRoomHandle#event:VIDEOROOM_LEAVING
     * @type {module:videoroom-plugin~VIDEOROOM_EVENT_LEAVING}
     */
    VIDEOROOM_LEAVING: PLUGIN_EVENT.LEAVING,

    /**
     * A participant has changed the display name.
     *
     * @event module:videoroom-plugin~VideoRoomHandle#event:VIDEOROOM_DISPLAY
     * @type {object}
     * @property {number|string} room - The involved room
     * @property {number|string} feed - The feed of the peer that change display name
     * @property {string} display - The new display name of the peer
     */
    VIDEOROOM_DISPLAY: PLUGIN_EVENT.DISPLAY,

    /**
     * A handle received a slow link notification.
     *
     * @event module:videoroom-plugin~VideoRoomHandle#event:VIDEOROOM_DISPLAY
     * @type {object}
     * @property {number|string} room - The involved room
     * @property {number|string} feed - The feed of the peer that change display name
     * @property {number} bitrate - The current bitrate cap for the participant
     */
    VIDEOROOM_SLOWLINK: PLUGIN_EVENT.SLOW_LINK,

    /**
     * Notify if the current user is talking.
     *
     * @event module:videoroom-plugin~VideoRoomHandle#event:VIDEOROOM_TALKING
     * @type {object}
     * @property {number|string} room - The involved room
     * @property {number|string} feed - The feed of the peer this talking notification refers to
     * @property {boolean} talking - True if the participant is talking
     * @property {number} audio_level - The audio level of the participant in the range [0,127]
     */
    VIDEOROOM_TALKING: PLUGIN_EVENT.TALKING,

    /**
     * A feed has been kicked out.
     *
     * @event module:videoroom-plugin~VideoRoomHandle#event:VIDEOROOM_KICKED
     * @type {module:videoroom-plugin~VIDEOROOM_EVENT_KICKED}
     */
    VIDEOROOM_KICKED: PLUGIN_EVENT.KICKED,

    /**
     * Conference recording has been enabled or disabled.
     *
     * @event module:videoroom-plugin~VideoRoomHandle#event:VIDEOROOM_RECORDING_ENABLED_STATE
     * @type {module:videoroom-plugin~VIDEOROOM_EVENT_RECORDING_ENABLED_STATE}
     */
    VIDEOROOM_RECORDING_ENABLED_STATE: PLUGIN_EVENT.RECORDING_ENABLED_STATE,

    /**
     * A switch to a different simulcast substream has been completed.
     *
     * @event module:videoroom-plugin~VideoRoomHandle#event:VIDEOROOM_SC_SUBSTREAM_LAYER
     * @type {object}
     * @property {number|string} room - The involved room
     * @property {number|string} feed - The feed of the peer this notification refers to
     * @property {number} sc_substream_layer - The new simuclast substream layer relayed
     */
    VIDEOROOM_SC_SUBSTREAM_LAYER: PLUGIN_EVENT.SC_SUBSTREAM_LAYER,

    /**
     * A switch to a different number of simulcast temporal layers has been completed.
     *
     * @event module:videoroom-plugin~VideoRoomHandle#event:VIDEOROOM_SC_TEMPORAL_LAYERS
     * @type {object}
     * @property {number|string} room - The involved room
     * @property {number|string} feed - The feed of the peer this switch notification refers to
     * @property {number} sc_temporal_layers - The new number of simuclast teporal layers relayed
     */
    VIDEOROOM_SC_TEMPORAL_LAYERS: PLUGIN_EVENT.SC_TEMPORAL_LAYERS,

    /**
     * A multistream subscription has been updated.
     *
     * @event module:videoroom-plugin~VideoRoomHandle#event:VIDEOROOM_UPDATED
     * @type {object}
     * @property {number|string} room - The involved room
     * @param {RTCSessionDescription} [params.jsep] - The updated JSEP offer
     * @param {object[]} streams - List of the streams in this subscription
     */
    VIDEOROOM_UPDATED: PLUGIN_EVENT.UPDATED,

    /**
     * A generic videoroom error.
     *
     * @event module:videoroom-plugin~VideoRoomHandle#event:VIDEOROOM_ERROR
     * @type {Error}
     */
    VIDEOROOM_ERROR: PLUGIN_EVENT.ERROR,
  },
};