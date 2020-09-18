import * as React from "react";
import Sound from "react-sound";
import clsx from "clsx";
import Timeout = NodeJS.Timeout;

import {Collapse, createStyles, Grid, IconButton, Slider, Theme, Tooltip, Typography, withStyles} from "@material-ui/core";

import Forward10Icon from '@material-ui/icons/Forward10';
import Replay10Icon from '@material-ui/icons/Replay10';
import PauseIcon from '@material-ui/icons/Pause';
import PlayArrowIcon from '@material-ui/icons/PlayArrow';
import VolumeDownIcon from '@material-ui/icons/VolumeDown';
import VolumeUpIcon from '@material-ui/icons/VolumeUp';

import {getTimestamp} from "../../data/utils";
import {SceneSettings} from "../../data/Config";
import {TF} from "../../data/const";
import Audio from "../../data/Audio";
import Scene from "../../data/Scene";
import SoundTick from "./SoundTick";

const styles = (theme: Theme) => createStyles({
  fullWidth: {
    width: '100%',
  },
  noPadding: {
    padding: '0 !important',
  },
});

function getTimestampFromMs(ms: number): string {
  const secs = Math.floor(ms / 1000);
  return getTimestamp(secs);
}

class AudioControl extends React.Component {
  readonly props: {
    classes: any,
    audio: Audio,
    playlistIndex: number,
    scene: Scene,
    scenePaths: Array<any>,
    startPlaying: boolean,
    onUpdateScene(scene: Scene | SceneSettings, fn: (scene: Scene | SceneSettings) => void): void,
    onTrackEnd(): void,
    goBack?(): void,
    playNextScene?(): void,
  };

  readonly state = {
    playing: this.props.startPlaying,
    position: 0,
    duration: 0,
    tick: false,
  };

  render() {
    const classes = this.props.classes;
    const audio = this.props.audio;
    const playing = this.state.playing
      ? (Sound as any).status.PLAYING
      : (Sound as any).status.PAUSED;

    const audioVolume = typeof audio.volume === 'number' ? audio.volume : 0;
    return(
      <React.Fragment key={audio.id}>
        {this.props.scene.audioEnabled && this.props.audio.tick && (
          <SoundTick
            url={this.props.audio.url}
            playing={playing}
            speed={this.props.audio.speed / 10}
            volume={this.props.audio.volume}
            tick={this.state.tick}
            onPlaying={this.onPlaying.bind(this)}
          />
        )}
        {this.props.scene.audioEnabled && !this.props.audio.tick && (
          <Sound
            url={this.props.audio.url}
            playStatus={playing}
            playbackRate={this.props.audio.speed / 10}
            volume={this.props.audio.volume}
            position={this.state.position}
            onPlaying={this.onPlaying.bind(this)}
            onError={this.onError.bind(this)}
            onFinishedPlaying={this.onFinishedPlaying.bind(this)}
          />
        )}
        <Grid item xs={12} className={clsx(!this.props.scene.audioEnabled && classes.noPadding)}>
          <Collapse in={this.props.scene.audioEnabled} className={classes.fullWidth}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12}>
                <Grid container spacing={1} alignItems="center" justify="center">
                  <Grid item xs={12} sm={12}>
                    <Grid container spacing={1} alignItems="center">
                      <Grid item>
                        <Typography id="strobe-opacity-slider" variant="caption" component="div" color="textSecondary">
                          {getTimestampFromMs(this.state.position)}
                        </Typography>
                      </Grid>
                      <Grid item xs>
                        <Slider
                          value={this.state.position}
                          max={this.state.duration}
                          onChange={this.onChangePosition.bind(this)}/>
                      </Grid>
                      <Grid item>
                        <Typography id="strobe-opacity-slider" variant="caption" component="div" color="textSecondary">
                          {getTimestampFromMs(this.state.duration)}
                        </Typography>
                      </Grid>
                    </Grid>
                  </Grid>
                  <Grid item>
                    <Tooltip title="Jump Back">
                      <IconButton
                        onClick={this.onBack.bind(this)}>
                        <Replay10Icon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={this.state.playing ? "Pause" : "Play"}>
                      <IconButton
                        onClick={this.state.playing ? this.onPause.bind(this) : this.onPlay.bind(this)}>
                        {this.state.playing ? <PauseIcon/> : <PlayArrowIcon/>}
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Jump Forward">
                      <IconButton
                        onClick={this.onForward.bind(this)}>
                        <Forward10Icon />
                      </IconButton>
                    </Tooltip>
                  </Grid>
                </Grid>
              </Grid>
              <Grid item xs={12}>
                <Grid container spacing={1} alignItems="center">
                  <Grid item>
                    <VolumeDownIcon />
                  </Grid>
                  <Grid item xs>
                    <Slider value={audioVolume}
                            onChange={this.onAudioSliderChange.bind(this, 'volume')}
                            aria-labelledby="audio-volume-slider" />
                  </Grid>
                  <Grid item>
                    <VolumeUpIcon />
                  </Grid>
                </Grid>
              </Grid>
            </Grid>
          </Collapse>
        </Grid>
      </React.Fragment>
    );
  }

  _audio = "";
  _timeout: Timeout = null;
  componentDidMount() {
    this._audio=JSON.stringify(this.props.audio);
    if (this.props.startPlaying) {
      this.tickLoop(true);
    }
  }

  componentDidUpdate(props: any) {
    let audio = JSON.parse(this._audio);
    if ((this.props.audio.tick && !audio.tick) ||
      (this.props.audio.tick && audio.tickMode == TF.scene && this.props.audio.tickMode != TF.scene)){
      if (this.props.startPlaying) {
        this.tickLoop(true);
      }
    }
    if (this.props.audio.tick && this.props.audio.tickMode == TF.scene && props.scenePaths && props.scenePaths.length > 0 && props.scenePaths !== this.props.scenePaths) {
      this.setState({tick: !this.state.tick});
    }
    this._audio=JSON.stringify(this.props.audio);
  }

  componentWillUnmount() {
    if(this._timeout != null) {
      clearTimeout(this._timeout);
    }
  }

  tickLoop(starting: boolean = false) {
    if (!starting) {
      this.setState({tick: !this.state.tick});
    }
    if (this.props.audio.tick) {
      let timeout: number = null;
      switch (this.props.audio.tickMode) {
        case TF.random:
          timeout = Math.floor(Math.random() * (this.props.audio.tickMaxDelay - this.props.audio.tickMinDelay + 1)) + this.props.audio.tickMinDelay;
          break;
        case TF.sin:
          const sinRate = (Math.abs(this.props.audio.tickSinRate - 100) + 2) * 1000;
          timeout = Math.floor(Math.abs(Math.sin(Date.now() / sinRate)) * (this.props.audio.tickMaxDelay - this.props.audio.tickMinDelay + 1)) + this.props.audio.tickMinDelay;
          break;
        case TF.constant:
          timeout = this.props.audio.tickDelay;
          break;
        case TF.bpm:
          const bpmMulti = this.props.audio.tickBPMMulti / 10;
          timeout = 60000 / (this.props.audio.bpm * bpmMulti);
          // If we cannot parse this, default to 1s
          if (!timeout) {
            timeout = 1000;
          }
          break;
      }
      if (timeout != null) {
        this._timeout = setTimeout(this.tickLoop.bind(this), timeout);
        return
      }
    }
    this._timeout = null;
  }

  onChangePosition(e: MouseEvent, value: number) {
    this.setState({position: value});
  }

  onAudioSliderChange(key: string, e: MouseEvent, value: number) {
    this.changeKey(key, value);
  }

  changeKey(key: string, value: any) {
    this.update((s) => s.audioPlaylists[this.props.playlistIndex].find((a: Audio) => a.id == this.props.audio.id)[key] = value);
  }

  update(fn: (scene: any) => void) {
    this.props.onUpdateScene(this.props.scene, fn);
  }

  onFinishedPlaying() {
    if (this.props.audio.stopAtEnd && this.props.goBack) {
      this.props.goBack();
    } else if (this.props.audio.nextSceneAtEnd && this.props.playNextScene) {
      this.props.playNextScene();
      this.setState({position: 0, duration: 0});
    } else {
      this.props.onTrackEnd();
      this.setState({position: 0, duration: 0});
    }
  }

  onPlaying(soundData: any) {
    let position = this.state.position;
    let duration = this.state.duration;
    if (soundData.position) {
      position = soundData.position;
    }
    if (soundData.duration) {
      duration = soundData.duration;
    }
    this.setState({position: position , duration: duration});
  }

  onError(errorCode: number, description: string) {
    console.error(errorCode + " - " + description);
  }

  onPlay() {
    this.setState({playing: true});
  }

  onPause() {
    this.setState({playing: false});
  }

  onBack() {
    let position = this.state.position - 10000;
    if (position < 0) {
      position = 0;
    }
    this.setState({position: position});
  }

  onForward() {
    let position = this.state.position + 10000;
    if (position > this.state.duration) {
      position = this.state.duration;
    }
    this.setState({position: position});
  }
}

export default withStyles(styles)(AudioControl as any);