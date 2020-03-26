"use strict";

class VC
{
	constructor( config )
	{
		const defConfig =
		{
			buffersize: 512,
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

		this.buffersize = config.buffersize;

		this.sig =
		{
			LMin: 0.0,
			LMax: 1.0,

			CMin: -1.0,
			CMax: 1.0,
		};

		this.hPhase = 0;
		this.vPhase = 0;

		this.pulse =
		{
			time: 0,
			timeout: 0,
			luma: 0,
			lumaPrev: 0,
			chroma: 0,
			chromaPrev: 0,
			changed: false,
			ready: false
		};

		this.timing =
		{
			time: 0,
			lastV: 0,
			lastH: 0,
		};

		this.field = 0;
		this.chromaField = 0;

		this.chromaDelay = [];
		this.chromaDelayIndex = 0;

		this.lines = [];
		this.currLine =
		{
			x1: 0,
			y: 0,
			maxPhase: 0,
			colors: []
		};
		this.lastClear = 0;
		this.clearInterval = config.clearInterval;

		this.overScan = config.overScan;
		this.hOffset = config.hOffset;

		this.pulseLength = config.pulseLength;

		this.canvas = config.canvas;
		this.ctx = this.canvas.getContext( "2d" );

		this.width = this.canvas.width;
		this.height = this.canvas.height;

		this.lineWidth = config.lineWidth;
		this.blend = config.blend;
		this.brightness = config.brightness;
		this.saturation = config.saturation;

		requestAnimationFrame( () => this.draw() );

		this.audioCtx = new window.AudioContext();
		this.sampleRate = this.audioCtx.sampleRate;

		this.audioInput = null;
		this.decoder = null;

		this.hFreqTarget = 1.0 / config.hFreq * this.sampleRate;
		this.vFreqTarget = 1.0 / config.vFreq * this.sampleRate;
		this.hFreq = this.hFreqTarget;
		this.vFreq = this.vFreqTarget;

		navigator.mediaDevices.getUserMedia(
			{
				audio: {
					echoCancellation: false,
					noiseSuppression: false,
					autoGainControl: false,
					channelCount: 2
				}
			} )
			.then( stream =>
			{
				this.audioInput = this.audioCtx.createMediaStreamSource( stream );

				this.decoder = this.audioCtx.createScriptProcessor( this.buffersize, 2, 2 );

				this.decoder.onaudioprocess = event => this.process( event );

				this.audioInput.connect( this.decoder );
				this.decoder.connect( this.audioCtx.destination ); // Needed to work around webkit bug
			} )
			.catch( console.error );
	}

	hPhaseToX( hPhase, vPhase, field )
	{
		return ( ( hPhase - this.hOffset ) / this.overScan ) * this.width;
	}

	vPhaseToY( hPhase, vPhase, field )
	{
		return ( vPhase + ( field / this.vFreq ) * this.hFreq * 0.5 ) * this.height;
	}

	YCbCrToRGB( y, cb, cr )
	{
		let r = y + 45 * cr / 32;
		let g = y - ( 11 * cb + 23 * cr ) / 32;
		let b = y + 113 * cb / 64;

		return [ r, g, b ]
	}

	process( event )
	{
		let lSamples = event.inputBuffer.getChannelData( 0 );
		let cSamples = event.inputBuffer.getChannelData( 1 );

		let sampleRate = this.sampleRate;

		let s = this.sig;
		let p = this.pulse;

		let blank = false;

		for( let i = 0; i < lSamples.length; i++ )
		{
			this.timing.time += 1;

			let lSample = lSamples[ i ] + Math.random() * 0.01 - 0.005;
			let cSample = cSamples[ i ] + Math.random() * 0.01 - 0.005;


			if( lSample < s.LMin ) s.LMin = lSample;
			if( lSample > s.LMax ) s.LMax = lSample;

			s.LMin *= 1.0 - ( 1.0 / sampleRate );
			s.LMax *= 1.0 - ( 1.0 / sampleRate );

			if( s.LMin > -0.025 ) s.LMin = -0.025;
			if( s.LMax < 0.025 ) s.LMax = 0.025;


			if( cSample < s.CMin ) s.CMin = cSample;
			if( cSample > s.CMax ) s.CMax = cSample;

			s.CMin *= 1.0 - ( 1.0 / sampleRate );
			s.CMax *= 1.0 - ( 1.0 / sampleRate );

			if( s.CMin > -0.05 ) s.CMin = -0.05;
			if( s.CMax < 0.05 ) s.CMax = 0.05;


			let luma = ( lSample * 2.0 - s.LMin ) / ( s.LMax - s.LMin ) * this.brightness * 255;
			let chroma = ( cSample * 2.0 - s.CMin ) / ( s.CMax - s.CMin ) * this.saturation * 255;
			let chromaLast = this.chromaDelay[ this.chromaDelayIndex ] || 0;

			if( this.chromaDelayIndex < sampleRate / 10.0 )
			{
				this.chromaDelay[ this.chromaDelayIndex ] = chroma;
				this.chromaDelayIndex++;
			}

			chroma = chroma - 128;
			chromaLast = chromaLast - 128;

			if( this.chromaField == 0 )
				var [ r, g, b ] = this.YCbCrToRGB( luma, chromaLast, chroma )
			else
				var [ r, g, b ] = this.YCbCrToRGB( luma, chroma, chromaLast )

			if( this.currLine.colors.length < 1024 )
				this.currLine.colors.push(
					{
						phase: this.hPhase,
						r: Math.max( Math.min( Math.round( r ), 255 ), 0 ),
						g: Math.max( Math.min( Math.round( g ), 255 ), 0 ),
						b: Math.max( Math.min( Math.round( b ), 255 ), 0 )
					}
				);

			this.currLine.maxPhase = this.hPhase;

			this.hPhase += 1.0 / this.hFreq;
			this.vPhase += 1.0 / this.vFreq;

			this.currLine.x2 = this.hPhaseToX( this.hPhase, this.vPhase, this.field );

			if( ( ( s.LMax - s.LMin ) > 0.1 ) && ( ( s.CMax - s.CMin ) > 0.1 ) )
			{
				if( lSample < s.LMin * 0.5 )
					p.luma = -1;
				else if( lSample > s.LMax * 0.5 )
					p.luma = 1;
				else
					p.luma = 0;

				if( cSample < s.CMin * 0.5 )
					p.chroma = -1;
				else if( cSample > s.CMax * 0.5 )
					p.chroma = 1;
				else
					p.chroma = 0;

				if( ( p.luma != p.lumaPrev ) || ( p.chroma != p.chromaPrev ) )
				{
					p.time = 0;
					p.lumaPrev = p.luma;
					p.chromaPrev = p.chroma;
					p.changed = true;
				}

				if( ( p.luma != 0 ) && ( p.chroma != 0 ) )
				{
					p.time += 1.0 / sampleRate;

					if( ( p.time > this.pulseLength * 0.5 ) && ( p.changed == true ) )
					{
						p.changed = false;

						if( p.ready == false )
						{
							p.ready = true;
							p.timeout = this.pulseLength * 1.25;
						}
						else
						{
							p.ready = false;
							blank = true;

							if( ( this.timing.time - this.timing.lastH < this.hFreqTarget * 1.5 ) &&
								( this.timing.time - this.timing.lastH > this.hFreqTarget * 0.5 ) )
								this.hFreq = this.hFreq * 0.9 + ( this.timing.time - this.timing.lastH ) * 0.1;

							this.timing.lastH = this.timing.time;

							this.hPhase = 0;
							this.chromaDelayIndex = 0;

							if( p.luma > 0 )
								this.chromaField = 0;
							else
								this.chromaField = 1;

							if( p.luma != p.chroma )
							{
								if( ( this.timing.time - this.timing.lastV < this.vFreqTarget * 1.5 ) &&
									( this.timing.time - this.timing.lastV > this.vFreqTarget * 0.5 ) )
									this.vFreq = this.vFreq * 0.75 + ( this.timing.time - this.timing.lastV ) * 0.25;

								this.timing.lastV = this.timing.time;

								this.vPhase = 0;
								this.chromaField = 1;

								if( p.luma > 0 )
									this.field = 0;
								else
									this.field = 1;
							}
						}
					}
				}

				if( p.ready )
				{
					p.timeout -= 1.0 / sampleRate;
					if( p.timeout <= 0 )
					{
						p.ready = false;
					}
				}
			}
			else
			{
				p.luma = p.lumaPrev = 0;
				p.chroma = p.chromaPrev = 0;
				p.changed = false;
				p.ready = false;
			}

			this.hFreq = this.hFreq * ( 1.0 - 1.0 / sampleRate ) + this.hFreqTarget * ( 1.0 / sampleRate );
			this.vFreq = this.vFreq * ( 1.0 - 1.0 / sampleRate ) + this.vFreqTarget * ( 1.0 / sampleRate );

			if( this.hPhase >= 1.0 )
			{
				blank = true;

				this.hPhase -= 1.0;
				this.chromaDelayIndex = 0;

				if( this.chromaField == 1 )
					this.chromaField = 0;
				else
					this.chromaField = 1;
			}

			if( this.vPhase >= 1.0 )
			{
				blank = true;

				this.vPhase -= 1.0;

				if( this.field == 0 )
					this.field = 1;
				else
					this.field = 0;
			}

			if( blank )
			{
				if(
					( this.lines.length < 1024 ) &&
					( this.currLine.colors.length > 5 ) &&
					( this.currLine.maxPhase > 0 )
				)
					this.lines.push( this.currLine );

				this.currLine =
				{
					x1: this.hPhaseToX( this.hPhase, this.vPhase, this.field ),
					y: this.vPhaseToY( this.hPhase, this.vPhase, this.field ),
					maxPhase: 0,
					colors: []
				};

				blank = false;
			}
		}
	}

	draw()
	{
		requestAnimationFrame( () => this.draw() );

		if( Date.now() - this.lastClear > this.clearInterval )
		{
			this.ctx.fillStyle = 'rgba(0,0,0,0.05)';
			this.ctx.globalCompositeOperation = 'source-over';
			this.ctx.fillRect( 0, 0, this.width, this.height );
			this.lastClear = Date.now();
		}

		if( this.blend )
			this.ctx.globalCompositeOperation = 'screen';

		this.ctx.lineWidth = this.lineWidth;

		for( let line of this.lines )
		{
			var grd = this.ctx.createLinearGradient( line.x1, line.y, line.x2, line.y );

			for( let color of line.colors )
				grd.addColorStop( color.phase / line.maxPhase, 'rgb(' + color.r + ',' + color.g + ',' + color.b + ')' );

			this.ctx.beginPath();

			this.ctx.moveTo( line.x1 + Math.random() * 2.0 - 1.0, line.y + Math.random() * 2.0 - 1.0 );
			this.ctx.lineTo( line.x2 + Math.random() * 2.0 - 1.0, line.y + Math.random() * 2.0 - 1.0 );

			this.ctx.strokeStyle = grd;

			this.ctx.stroke();
		}

		this.lines = [];
	}
}
