import * as React from 'react';
import {animated} from "react-spring";
import Timeout = NodeJS.Timeout;

import {getRandomColor, getRandomListItem} from "../../data/utils";
import {BT, HTF, IT, OT, SL, ST, TF, VTF} from "../../data/const";
import Scene from "../../data/Scene";
import Audio from "../../data/Audio";
import Strobe from "./Strobe";
import wretch from "wretch";
import FadeInOut from "./FadeInOut";
import Panning from "./Panning";
import CrossFade from "./CrossFade";
import ZoomMove from "./ZoomMove";
import Slide from "./Slide";
import StrobeImage from "./StrobeImage";

export default class ImageView extends React.Component {
  readonly props: {
    image: HTMLImageElement | HTMLVideoElement | HTMLIFrameElement,
    fitParent: boolean,
    hasStarted: boolean,
    scene: Scene,
    currentAudio?: Audio,
    timeToNextFrame?: number,
    toggleStrobe?: boolean,
    pictureGrid?: boolean,
    removeChild?: boolean
    onLoaded?(): void,
    setVideo?(video: HTMLVideoElement): void,
  };

  readonly backgroundRef: React.RefObject<HTMLDivElement> = React.createRef();
  readonly contentRef: React.RefObject<HTMLDivElement> = React.createRef();
  _image: HTMLImageElement | HTMLVideoElement | HTMLIFrameElement = null;
  _timeouts: Array<Timeout>;

  componentDidMount() {
    this._timeouts = new Array<Timeout>();
    this._applyImage();
  }

  componentDidUpdate(props: any) {
    let forceBG = false;
    if (!this.props.pictureGrid && this.props.scene.backgroundType !== props.scene.backgroundType) {
      if (this.props.scene.backgroundType === BT.blur) {
        forceBG = true;
      } else if (props.scene.backgroundType === BT.blur && this.backgroundRef.current.firstChild) {
        this.backgroundRef.current.removeChild(this.backgroundRef.current.firstChild);
      }
    }
    this._applyImage(forceBG);
    if (!props.hasStarted && this.props.hasStarted) {
      const el = this.contentRef.current;
      if (el && el.firstChild && el.firstChild instanceof HTMLVideoElement) {
        const volume = el.firstChild.hasAttribute("volume") ? parseInt(el.firstChild.getAttribute("volume")) : this.props.scene.videoVolume;
        el.firstChild.volume = volume / 100;
      }
    }
  }

  componentWillUnmount() {
    this.clearTimeouts();
    this._timeouts = null;
  }

  clearTimeouts() {
    for (let timeout of this._timeouts) {
      clearTimeout(timeout);
    }
  }

  _applyImage(forceBG = false) {
    const el = this.contentRef.current;
    const bg = this.backgroundRef.current;
    const img = this.props.image;
    if (!el || !img) return;

    const firstChild = el.firstChild;
    if (!forceBG && firstChild && (firstChild as HTMLImageElement | HTMLVideoElement | HTMLIFrameElement).src == img.src) return;

    if (!forceBG && img instanceof HTMLVideoElement && img.hasAttribute("subtitles")) {
      try {
        let subURL = img.getAttribute("subtitles");
        wretch(subURL)
          .get()
          .blob((blob) => {
            let track: any = document.createElement("track");
            track.kind = "captions";
            track.label = "English";
            track.srclang = "en";
            track.src = URL.createObjectURL(blob);
            if (img.textTracks.length == 0) {
              img.append(track);
            } else {
              img.textTracks[0] = track;
            }
            track.mode = "showing";
            img.textTracks[0].mode = "showing";
          });
      } catch (e) {
        console.error(e);
      }
    }

    const videoLoop = (v: any) => {
      if (!el || !el.parentElement || parseFloat(el.parentElement.style.opacity) == 0.99 || v.paused || this._timeouts == null) return;
      if (v.ended) {
        v.onended(null);
        return;
      }
      let crossFadeAudio = !this.props.pictureGrid && this.props.scene.crossFadeAudio;
      if (!this.props.pictureGrid && this.props.hasStarted && this.props.scene.crossFade && crossFadeAudio && v instanceof HTMLVideoElement) {
        const volume = v.hasAttribute("volume") ? parseInt(v.getAttribute("volume")) : this.props.scene.videoVolume;
        v.volume = (volume / 100) * parseFloat(el.parentElement.parentElement.getAttribute("volume"));
      }
      if (v.hasAttribute("start") && v.hasAttribute("end")) {
        const start = v.getAttribute("start");
        const end = v.getAttribute("end");
        if (v.currentTime > end) {
          v.onended(null);
          v.currentTime = start;
        }
      }
      this._timeouts.push(setTimeout(videoLoop, 100, v));
    };

    const drawLoop = (v: any, c: CanvasRenderingContext2D, w: number, h: number) => {
      if (!el || !el.parentElement || parseFloat(el.parentElement.style.opacity) == 0.99 || v.ended || v.paused || this._timeouts == null) return;
      c.drawImage(v, 0, 0, w, h);
      this._timeouts.push(setTimeout(drawLoop, 20, v, c, w, h));
    };

    let parentWidth = el.offsetWidth;
    let parentHeight = el.offsetHeight;
    if (this.props.fitParent) {
      parentWidth = el.parentElement.offsetWidth;
      parentHeight = el.parentElement.offsetHeight;
    }
    if (parentWidth == 0 || parentHeight == 0) {
      parentWidth = window.innerWidth;
      parentHeight = window.innerHeight;
    }
    let parentAspect = parentWidth / parentHeight;
    let imgWidth;
    let imgHeight;
    let type = null;
    if (img instanceof HTMLImageElement) {
      imgWidth = img.width;
      imgHeight = img.height;
    } else if (img instanceof HTMLVideoElement) {
      type = ST.video;
      imgWidth = img.videoWidth;
      imgHeight = img.videoHeight;
    } else if (img instanceof HTMLIFrameElement) {
      type = ST.nimja;
    }
    let imgAspect = imgWidth / imgHeight;

    const rotate = !this.props.pictureGrid &&
      ((type == ST.video &&
        ((this.props.scene.videoOrientation == OT.forceLandscape && imgWidth < imgHeight) ||
          (this.props.scene.videoOrientation == OT.forcePortrait && imgWidth > imgHeight))) ||
        (type == null &&
          ((this.props.scene.imageOrientation == OT.forceLandscape && imgWidth < imgHeight) ||
            (this.props.scene.imageOrientation == OT.forcePortrait && imgWidth > imgHeight))));

    const blur = !this.props.pictureGrid && this.props.scene.backgroundType == BT.blur && type != ST.nimja;
    let bgImg: any;
    if (blur) {
      if (img.src.endsWith(".gif")) {
        bgImg = img.cloneNode();
      } else {
        bgImg = document.createElement('canvas');

        const context = bgImg.getContext('2d');
        bgImg.width = parentWidth;
        bgImg.height = parentHeight;

        if (!this.props.scene.crossFade) {
          this.clearTimeouts();
        }
        if (type == null) {
          context.drawImage(img, 0, 0, parentWidth, parentHeight);
        } else if (type == ST.video) {
          img.onplay = () => {
            videoLoop(img);
            drawLoop(img, context, parentWidth, parentHeight);
          };
          if (forceBG) {
            drawLoop(img, context, parentWidth, parentHeight);
          }
        }
      }

      if (rotate) {
        bgImg.style.transform = "rotate(270deg)";
        if (imgAspect > parentAspect) {
          if (imgWidth > imgHeight) {
            const bgscale = (parentHeight + (0.04 * parentHeight)) / imgHeight;
            bgImg.style.width = (imgWidth * bgscale) + 'px';
            bgImg.style.height = parentWidth + "px";
            bgImg.style.marginTop = ((parentHeight - parentWidth) / 2) + "px";
            bgImg.style.marginLeft = ((parentWidth - (imgWidth * bgscale)) / 2) + "px";
          } else {
            const bgscale = (parentWidth + (0.04 * parentWidth)) / imgWidth;
            bgImg.style.width = parentHeight + "px";
            bgImg.style.height = (imgHeight * bgscale) + 'px';
            bgImg.style.marginTop = ((parentHeight - (imgHeight * bgscale)) / 2) + "px";
            bgImg.style.marinLeft = ((parentWidth - parentHeight) / 2) + "px";
          }
        } else {
          if (imgWidth > imgHeight) {
            const bgscale = (parentHeight + (0.04 * parentHeight)) / imgHeight;
            bgImg.style.width = (imgWidth * bgscale) + 'px';
            bgImg.style.height = parentWidth + "px";
            bgImg.style.marginTop = ((parentHeight - parentWidth) / 2) + "px";
            bgImg.style.marginLeft = ((parentWidth - (imgWidth * bgscale)) / 2) + "px";
          } else {
            const bgscale = (parentWidth + (0.04 * parentWidth)) / imgWidth;
            bgImg.style.width = parentHeight + "px";
            bgImg.style.height = (imgHeight * bgscale) + 'px';
            bgImg.style.marginTop = (parentHeight / 2 - imgHeight * bgscale / 2) + 'px';
            bgImg.style.marginLeft = ((parentWidth - parentHeight) / 2) + "px";
          }
        }

      } else {
        if (imgAspect < parentAspect) {
          const bgscale = (parentWidth + (0.04 * parentWidth)) / imgWidth;
          bgImg.style.width = '100%';
          bgImg.style.height = (imgHeight * bgscale) + 'px';
          bgImg.style.marginTop = (parentHeight / 2 - imgHeight * bgscale / 2) + 'px';
          bgImg.style.marginLeft = '0';
        } else {
          const bgscale = (parentHeight + (0.04 * parentHeight)) / imgHeight;
          bgImg.style.width = (imgWidth * bgscale) + 'px';
          bgImg.style.height = '100%';
          bgImg.style.marginTop = '0';
          bgImg.style.marginLeft = (parentWidth / 2 - imgWidth * bgscale / 2) + 'px';
        }
      }
    }

    if (!forceBG && img instanceof HTMLVideoElement) {
      if (!this.props.pictureGrid && this.props.hasStarted) {
        const volume = img.hasAttribute("volume") ? parseInt(img.getAttribute("volume")) : this.props.scene.videoVolume;
        img.volume = volume / 100;
      } else {
        img.volume = 0;
      }
      img.playbackRate = img.hasAttribute("speed") ? parseInt(img.getAttribute("speed")) / 10 : 1;
      if (!blur) {
        img.onplay = () => videoLoop(img);
      }
      if (img.paused) {
        img.play();
      }
    }

    if (!this.props.pictureGrid && type != ST.nimja) {
      switch (this.props.scene.imageType) {
        case (IT.fitBestClip):
          if (rotate) {
            imgAspect = imgHeight / imgWidth;
            img.style.transform = "rotate(270deg)";
            img.style.transformOrigin = "top right";
            if (imgAspect < parentAspect) {
              const scale = parentWidth / imgHeight;
              img.style.height = parentWidth.toString() + "px";
              img.style.marginLeft = '-' + imgWidth * scale + 'px';
              img.style.marginTop = (parentHeight / 2 - imgWidth * scale / 2) + 'px';
            } else {
              const scale = parentHeight / imgWidth;
              img.style.width = parentHeight.toString() + "px";
              img.style.marginLeft = (-parentHeight + (parentWidth / 2 - imgHeight * scale / 2)) + 'px';
            }
          } else {
            if (imgAspect > parentAspect) {
              const scale = parentHeight / imgHeight;
              img.style.width = 'auto';
              img.style.height = '100%';
              img.style.marginTop = '0';
              img.style.marginLeft = (parentWidth / 2 - imgWidth * scale / 2) + 'px';
            } else {
              const scale = parentWidth / imgWidth;
              img.style.width = '100%';
              img.style.height = 'auto';
              img.style.marginTop = (parentHeight / 2 - imgHeight * scale / 2) + 'px';
              img.style.marginLeft = '0';
            }
          }
          break;
        case (IT.centerNoClip):
          if (rotate) {
            img.style.transform = "rotate(270deg)";
            img.style.transformOrigin = "center";
          }
          const cTop = parentHeight - imgHeight;
          const cLeft = parentWidth - imgWidth;
          if (cTop >= 0 && cLeft >= 0) {
            img.style.marginTop = cTop / 2 + 'px';
            img.style.marginLeft = cLeft / 2 + 'px';
            break;
          }
        default:
        case (IT.fitBestNoClip):
          if (rotate) {
            imgAspect = imgHeight / imgWidth;
            if (imgAspect < parentAspect) {
              const scale = parentHeight / imgWidth;
              img.style.width = parentHeight.toString() + "px";
              img.style.marginLeft = (-parentHeight + (parentWidth / 2 - imgHeight * scale / 2)) + 'px';

              img.style.transform = "rotate(270deg)";
              img.style.transformOrigin = "top right";
            } else {
              const scale = parentWidth / imgHeight;
              img.style.height = parentWidth.toString() + "px";
              img.style.marginLeft = '-' + imgWidth * scale + 'px';
              img.style.marginTop = (parentHeight / 2 - imgWidth * scale / 2) + 'px';

              img.style.transform = "rotate(270deg)";
              img.style.transformOrigin = "top right";
            }
          } else {
            if (imgAspect < parentAspect) {
              const scale = parentHeight / imgHeight;
              img.style.width = 'auto';
              img.style.height = '100%';
              img.style.marginTop = '0';
              img.style.marginLeft = (parentWidth / 2 - imgWidth * scale / 2) + 'px';
            } else {
              const scale = parentWidth / imgWidth;
              img.style.width = '100%';
              img.style.height = 'auto';
              img.style.marginTop = (parentHeight / 2 - imgHeight * scale / 2) + 'px';
              img.style.marginLeft = '0';
            }
          }
          break;
        case (IT.stretch):
          if (rotate) {
            const scale = parentWidth / imgHeight;
            img.style.height = parentWidth.toString() + "px";
            img.style.marginLeft = '-' + imgWidth * scale + 'px';
            img.style.marginTop = (parentHeight / 2 - imgWidth * scale / 2) + 'px';

            img.style.transform = "rotate(270deg)";
            img.style.transformOrigin = "top right";
          } else {
            img.style.objectFit = 'fill';
            img.style.width = '100%';
            img.style.height = '100%';
          }
          break;
        case (IT.center):
          if (rotate) {
            img.style.transform = "rotate(270deg)";
            img.style.transformOrigin = "center";
          }
          const top = parentHeight - imgHeight;
          const left = parentWidth - imgWidth;
          img.style.marginTop = top / 2 + 'px';
          img.style.marginLeft = left / 2 + 'px';
          break;
        case (IT.fitWidth):
          if (rotate) {
            const scale = parentWidth / imgHeight;
            img.style.height = parentWidth.toString() + "px";
            img.style.marginLeft = '-' + imgWidth * scale + 'px';
            img.style.marginTop = (parentHeight / 2 - imgWidth * scale / 2) + 'px';

            img.style.transform = "rotate(270deg)";
            img.style.transformOrigin = "top right";
          } else {
            const hScale = parentWidth / imgWidth;
            img.style.width = '100%';
            img.style.height = 'auto';
            img.style.marginTop = (parentHeight / 2 - imgHeight * hScale / 2) + 'px';
            img.style.marginLeft = '0';
          }
          break;
        case (IT.fitHeight):
          if (rotate) {
            const scale = parentHeight / imgWidth;
            img.style.width = parentHeight.toString() + "px";
            img.style.marginLeft = (-parentHeight + (parentWidth / 2 - imgHeight * scale / 2)) + 'px';

            img.style.transform = "rotate(270deg)";
            img.style.transformOrigin = "top right";
          } else {
            const wScale = parentHeight / imgHeight;
            img.style.width = 'auto';
            img.style.height = '100%';
            img.style.marginTop = '0';
            img.style.marginLeft = (parentWidth / 2 - imgWidth * wScale / 2) + 'px';
          }
          break;
      }
    } else {
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.marginTop = '0';
      img.style.marginLeft = '0';
    }

    if (!forceBG) {
      if (this.props.setVideo) {
        this.props.setVideo(img instanceof HTMLVideoElement ? img : null);
      }

      this._image = img;
      if (this.props.removeChild && el.hasChildNodes()) {
        el.removeChild(el.children.item(0));
      }
      el.appendChild(img);
      if (img instanceof HTMLVideoElement && this.props.pictureGrid && img.paused) {
        img.play();
      }
      if (img instanceof HTMLIFrameElement) {
        img.onload = () => {
          img.contentWindow.document.getElementsByClassName("copyright")[0].remove();
          img.contentWindow.document.getElementById("intro-start").click();
        }
      }
    }
    if (blur) {
      if (this.props.removeChild && bg.hasChildNodes()) {
        bg.removeChild(bg.children.item(0));
      }
      bg.appendChild(bgImg);
    }

    if (this.props.onLoaded) {
      this.props.onLoaded();
    }
  }

  shouldComponentUpdate(props: any): boolean {
    return (!this.props.image && props.image) ||
      (props.image && this.props.image &&
        (props.image.src !== this.props.image.src ||
          props.image.getAttribute("start") !== this.props.image.getAttribute("start") ||
          props.image.getAttribute("end") !== this.props.image.getAttribute("end"))) ||
      (props.scene && (props.scene.strobe || props.scene.fadeInOut) && props.toggleStrobe !== this.props.toggleStrobe) ||
      props.scene !== this.props.scene ||
      props.hasStarted !== this.props.hasStarted;
  }

  render() {
    if (!this.props.image) {
      return (
        <div
          style={{
            zIndex: 2,
            margin: '-5px -10px -10px -5px',
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            overflow: 'hidden',
          }}>
          <div
            ref={this.contentRef}
            style={{
              height: '100%',
              width: '100%',
              zIndex: 2,
              overflow: 'hidden',
              backgroundPosition: 'center',
              backgroundSize: 'contain',
              backgroundRepeat: 'no-repeat',
              position: 'absolute',
            }}/>
          <div
            ref={this.backgroundRef}
            style={{
              height: '100%',
              width: '100%',
              zIndex: 1,
              backgroundSize: 'cover',
              overflow: 'hidden'
            }}/>
        </div>
      );
    } else if (this.props.pictureGrid) {
      return (
        <animated.div
          ref={this.contentRef}/>
      );
    }

    let backgroundStyle = {};
    if (this.props.scene.backgroundType == BT.color) {
      backgroundStyle = {
        backgroundColor: this.props.scene.backgroundColor,
      };
    } else if (this.props.scene.backgroundType == BT.colorSet) {
      backgroundStyle = {
        backgroundColor: getRandomListItem(this.props.scene.backgroundColorSet),
      };
    } else if (this.props.scene.backgroundType == BT.colorRand) {
      backgroundStyle = {
        backgroundColor: getRandomColor(),
      };
    } else if (this.props.scene.backgroundType == BT.blur) {
      backgroundStyle = {
        filter: 'blur(' + this.props.scene.backgroundBlur + 'px)',
      };
    }
    let viewDiv;
    let imageDiv =
      <animated.div
        id="image"
        ref={this.contentRef}
        style={{
          height: '100%',
          width: '100%',
          zIndex: 2,
          overflow: 'hidden',
          backgroundPosition: 'center',
          backgroundSize: 'contain',
          backgroundRepeat: 'no-repeat',
          position: 'absolute',
        }}/>;
    let backgroundDiv =
      <animated.div
        ref={this.backgroundRef}
        style={{
          height: '100%',
          width: '100%',
          zIndex: 1,
          backgroundSize: 'cover',
          overflow: 'hidden',
          ...backgroundStyle
        }}/>;
    if (this.props.scene.strobe && this.props.scene.strobeLayer == SL.image) {
      if (this.props.scene.strobePulse ? this.props.scene.strobeDelayTF == TF.scene : this.props.scene.strobeTF == TF.scene) {
        imageDiv =
          <StrobeImage
            scene={this.props.scene}
            timeToNextFrame={this.props.timeToNextFrame}
            currentAudio={this.props.currentAudio}>
            {imageDiv}
          </StrobeImage>
      } else {
        imageDiv =
          <Strobe
            currentAudio={this.props.currentAudio}
            zIndex={2}
            toggleStrobe={this.props.toggleStrobe}
            timeToNextFrame={this.props.timeToNextFrame}
            scene={this.props.scene}
            strobeFunction={this.strobeImage.bind(this)}>
            {imageDiv}
          </Strobe>
      }
    }
    if (this.props.scene.zoom || this.props.scene.horizTransType != HTF.none || this.props.scene.vertTransType != VTF.none) {
      imageDiv =
        <ZoomMove
          image={this.props.image}
          scene={this.props.scene}
          reset={!this.props.scene.panning && !this.props.scene.fadeInOut && !this.props.scene.slide && !this.props.scene.crossFade}
          timeToNextFrame={this.props.timeToNextFrame}
          currentAudio={this.props.currentAudio}>
          {imageDiv}
        </ZoomMove>
    }
    if (this.props.scene.fadeInOut) {
      imageDiv =
        <FadeInOut
          toggleFade={this.props.toggleStrobe}
          currentAudio={this.props.currentAudio}
          timeToNextFrame={this.props.timeToNextFrame}
          scene={this.props.scene}
          fadeFunction={this.strobeImage.bind(this)}>
          {imageDiv}
        </FadeInOut>
    }
    if (this.props.scene.panning) {
      imageDiv =
        <Panning
          image={this.props.image}
          togglePan={this.props.toggleStrobe}
          currentAudio={this.props.currentAudio}
          timeToNextFrame={this.props.timeToNextFrame}
          scene={this.props.scene}
          panFunction={this.strobeImage.bind(this)}>
          {imageDiv}
        </Panning>
    }
    viewDiv =
      <React.Fragment>
        {imageDiv}
        {this.props.scene && this.props.scene.strobe && this.props.scene.strobeLayer == SL.background && (
          <Strobe
            currentAudio={this.props.currentAudio}
            zIndex={1}
            toggleStrobe={this.props.toggleStrobe}
            timeToNextFrame={this.props.timeToNextFrame}
            scene={this.props.scene}/>
        )}
        {backgroundDiv}
      </React.Fragment>
    if (this.props.scene.crossFade) {
      viewDiv =
        <CrossFade
          image={this.props.image}
          scene={this.props.scene}
          timeToNextFrame={this.props.timeToNextFrame}
          currentAudio={this.props.currentAudio}>
          {viewDiv}
        </CrossFade>
    }
    if (this.props.scene.slide) {
      viewDiv =
        <Slide
          image={this.props.image}
          scene={this.props.scene}
          timeToNextFrame={this.props.timeToNextFrame}
          currentAudio={this.props.currentAudio}>
          {viewDiv}
        </Slide>
    }

    return (
      <animated.div
        style={{
          zIndex: 2,
          margin: '-5px -10px -10px -5px',
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          overflow: 'hidden',
        }}>
        {viewDiv}
      </animated.div>
    );
  }

  strobeImage() {
    const el = this.contentRef.current;
    if (el && this._image && this._image.src == this.props.image.src) {
      el.appendChild(this._image);
      if (this._image instanceof HTMLVideoElement && this._image.paused) {
        this._image.play();
      }
    }
  }
}

(ImageView as any).displayName="ImageView";