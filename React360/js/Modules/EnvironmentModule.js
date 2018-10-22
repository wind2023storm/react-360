/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 */

import type Environment from '../Compositor/Environment/Environment';
import type {VideoStereoFormat} from '../Compositor/Video/Types';
import Module from './Module';

type BlackSceneDef = {
  type: 'black',
};
type PhotoSceneDef = {
  force2D: boolean,
  stereo?: VideoStereoFormat,
  transform?: Array<number>,
  type: 'photo',
  url: string,
};
type VideoSceneDef = {
  player: string,
  type: 'video',
};

type SceneTransition = {
  transition?: number, // duration for fade in/out transition
  fadeLevel?: number, // initial fade level when fading in
};

type SceneDef = BlackSceneDef | PhotoSceneDef | VideoSceneDef;

export default class EnvironmentModule extends Module {
  _env: Environment;
  _preloadedSrc: ?string;

  constructor(env: Environment) {
    super('EnvironmentModule');

    this._env = env;
    this._preloadedSrc = null;
  }

  loadScene(scene: SceneDef, transition: SceneTransition) {
    transition = transition || {};
    if (scene.type === 'black') {
      this._env.setSource(null);
      return;
    }
    if (scene.type === 'photo') {
      this._env.setSource(scene.url, {
        format: scene.stereo, 
        transition: transition.transition,
        fadeLevel: transition.fadeLevel,
      });
      return;
    }
    if (scene.type === 'video') {
      this._env.setVideoSource(scene.player, {
        transition: transition.transition,
        fadeLevel: transition.fadeLevel,
      });
    }
  }

  preloadScene(scene: SceneDef) {
    if (scene.type === 'photo') {
      if (this._preloadedSrc === scene.url) {
        return;
      }
      if (this._preloadedSrc) {
        this._env.unloadImage(this._preloadedSrc);
        this._preloadedSrc = null;
      }
      if (scene.url) {
        this._env.preloadImage(scene.url);
        this._preloadedSrc = scene.url;
      }
    }
  }
  
  animateFade(fadeLevel: number, fadeTime: number) {
    this._env.animateFade(fadeLevel, fadeTime);
  }
}
