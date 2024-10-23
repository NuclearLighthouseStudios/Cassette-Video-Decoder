"use strict";

class VC
{
	constructor( canvas, config )
	{
		const defConfig =
		{
			color: true,
			clearInterval: 50,
			overScan: 0.82,
			hOffset: 0.06525,
			pulseLength: ( 0.2 / 1000 ),
			lineWidth: 2.5,
			brightness: 1,
			saturation: 1,
			blend: true,
			hFreq: 225.0,
			vFreq: 3
		};

		config = Object.assign( defConfig, config );

		this.lines = [];

		this.lastClear = 0;
		this.clearInterval = config.clearInterval;

		this.canvas = canvas;

		this.width = this.canvas.width;
		this.height = this.canvas.height;

		this.lineWidth = config.lineWidth;
		this.blend = config.blend;

		this.config = config;

		this.graphicsContext = null;
		this.audioContext = null;
		this.audioInput = null;
		this.decoder = null;
	}

	async start()
	{
		this.graphicsContext = this.canvas.getContext( "2d" );

		this.audioContext = new window.AudioContext();

		let stream = await navigator.mediaDevices.getUserMedia(
			{
				audio: {
					echoCancellation: false,
					noiseSuppression: false,
					autoGainControl: false,
					channelCount: {
						exact: 2
					}
				}
			} );

		this.audioInput = this.audioContext.createMediaStreamSource( stream );

		if( this.config.color )
			await this.audioContext.audioWorklet.addModule( 'cv-decoder-color.js' )
		else
			await this.audioContext.audioWorklet.addModule( 'cv-decoder-bw.js' )

		this.decoder = new AudioWorkletNode( this.audioContext, 'cv-decoder',
			{
				numberOfInputs: 2,
				numberOfOutputs: 0,
				processorOptions: this.config
			}
		);

		this.decoder.port.onmessage = event =>
		{
			if( this.lines.length < 1024 )
				this.lines.push( event.data )
		};

		this.audioInput.connect( this.decoder );

		requestAnimationFrame( () => this.draw() );
	}

	activate()
	{
		this.audioContext.resume();
	}

	draw()
	{
		if( Date.now() - this.lastClear > this.clearInterval )
		{
			this.graphicsContext.fillStyle = 'rgba(0,0,0,0.05)';
			this.graphicsContext.globalCompositeOperation = 'source-over';
			this.graphicsContext.fillRect( 0, 0, this.width, this.height );
			this.lastClear = Date.now();
		}

		if( this.blend )
			this.graphicsContext.globalCompositeOperation = 'screen';
		else
			this.graphicsContext.globalCompositeOperation = 'source-over';

		this.graphicsContext.lineWidth = this.lineWidth;

		const width = this.width;
		const height = this.height;

		for( let line of this.lines )
		{
			var gradient = this.graphicsContext.createLinearGradient( line.x1 * width, line.y * height, line.x2 * width, line.y * height );

			for( let color of line.colors )
				gradient.addColorStop( color.phase / line.maxPhase, 'rgb(' + color.r + ',' + color.g + ',' + color.b + ')' );

			this.graphicsContext.beginPath();

			this.graphicsContext.moveTo( line.x1 * width + Math.random() * 2.0 - 1.0, line.y * height + Math.random() * 2.0 - 1.0 );
			this.graphicsContext.lineTo( line.x2 * width + Math.random() * 2.0 - 1.0, line.y * height + Math.random() * 2.0 - 1.0 );

			this.graphicsContext.strokeStyle = gradient;

			this.graphicsContext.stroke();
		}

		this.lines = [];

		requestAnimationFrame( () => this.draw() );
	}
}