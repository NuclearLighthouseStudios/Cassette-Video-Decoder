# Welcome to the world of Cassette Video!

This is the decoder for the cassette video format, a way to turn videos into audio to put them on normal compact audio cassettes.

## Installation

Just put this somewhere and include it in your html. No installation needed.  ¯\\\_(ツ)\_/¯


## Usage
Check out the included example index.html file. Just instantiate a new decoder object and pass it the canvas you want to use as output in the options object.

The following additional options are also available

```
	hFreq: 225.0,
	vFreq: 3,
	overScan: 0.82,
	hOffset: 0.06525,
	pulseLength: ( 0.2 / 1000 ),
```
Timing parameters. These will be output by the encoder script during encoding.

```
	brightness: 1,
	saturation: 1,
```
Brightness and saturation of the image. Increase these if the image looks dull or too dark.

```
	lineWidth: 2.5,
```
Width of the lines drawn on screen. Increase this when your video has low vertical resolution, decrease this if you want more of a scan line effect.

```
	clearInterval: 50,
```
How often the screen is cleared. Decreasing this will make the image fade faster. Might be needed for higher frame rates to reduce smearing or ghosting.

```
	blend: true,
```
Disabling this will reduce ghosting but can also make the image look a little dark and less "CRT-like"