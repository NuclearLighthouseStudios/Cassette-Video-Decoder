class CVDecoder extends AudioWorkletProcessor
{
	constructor( options )
	{
		super( options );

		let config = options.processorOptions;

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
			length: 0,
			timeout: 0,
			luma: 0,
			lumaPrev: 0,
			chroma: 0,
			chromaPrev: 0,
			edge: false,
			count: false
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

		this.currLine =
		{
			x1: 0,
			y: 0,
			maxPhase: 0,
			colors: []
		};

		this.overScan = config.overScan;
		this.hOffset = config.hOffset;

		this.pulseLength = config.pulseLength;

		this.brightness = config.brightness;
		this.saturation = config.saturation;

		this.hPerTarget = 1.0 / config.hFreq * sampleRate;
		this.vPerTarget = 1.0 / config.vFreq * sampleRate;
		this.hPeriod = this.hPerTarget;
		this.vPeriod = this.vPerTarget;
	}

	hPhaseToX( hPhase, vPhase, field )
	{
		return ( ( hPhase - this.hOffset ) / this.overScan );
	}

	vPhaseToY( hPhase, vPhase, field )
	{
		return ( vPhase + ( field / this.vPeriod ) * this.hPeriod * 0.5 );
	}

	YCbCrToRGB( y, cb, cr )
	{
		let r = y + 45 * cr / 32;
		let g = y - ( 11 * cb + 23 * cr ) / 32;
		let b = y + 113 * cb / 64;

		return [ r, g, b ]
	}

	process( inputs, outputs, parameters )
	{
		if( inputs[ 0 ].length != 2 )
			return;

		let lSamples = inputs[ 0 ][ 0 ];
		let cSamples = inputs[ 0 ][ 1 ];

		let s = this.sig;
		let p = this.pulse;
		let t = this.timing;

		let blank = false;

		for( let i = 0; i < lSamples.length; i++ )
		{
			t.time += 1;

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
			let chroma = ( ( cSample * 2.0 - s.CMin ) / ( s.CMax - s.CMin ) * 255 - 128 ) * this.saturation;
			let chromaLast = this.chromaDelay[ this.chromaDelayIndex ] || 0;

			if( this.chromaDelayIndex < sampleRate / 10.0 )
			{
				this.chromaDelay[ this.chromaDelayIndex ] = chroma;
				this.chromaDelayIndex++;
			}

			let [ r, g, b ] = ( this.chromaField == 0 ) ?
				this.YCbCrToRGB( luma, chromaLast, chroma ) :
				this.YCbCrToRGB( luma, chroma, chromaLast );

			if( this.currLine.colors.length < this.hPerTarget * 2.0 )
				this.currLine.colors.push(
					{
						phase: this.hPhase,
						r: Math.max( Math.min( Math.round( r ), 255 ), 0 ),
						g: Math.max( Math.min( Math.round( g ), 255 ), 0 ),
						b: Math.max( Math.min( Math.round( b ), 255 ), 0 )
					}
				);

			this.currLine.maxPhase = this.hPhase;

			this.hPhase += 1.0 / this.hPeriod;
			this.vPhase += 1.0 / this.vPeriod;

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
					p.length = 0;
					p.lumaPrev = p.luma;
					p.chromaPrev = p.chroma;
					p.edge = true;
				}

				if( ( p.luma != 0 ) && ( p.chroma != 0 ) )
				{
					p.length += 1.0 / sampleRate;

					if( ( p.length > this.pulseLength * 0.5 ) && ( p.edge == true ) )
					{
						p.edge = false;
						p.count += 1;
						p.timeout = this.pulseLength * 1.25;

						if( p.count == 2 )
						{
							p.count = 0;
							blank = true;

							if( ( t.time - t.lastH < this.hPerTarget * 1.5 ) &&
								( t.time - t.lastH > this.hPerTarget * 0.5 ) )
								this.hPeriod = this.hPeriod * 0.9 + ( t.time - t.lastH ) * 0.1;

							t.lastH = t.time;

							this.hPhase = 0;
							this.chromaDelayIndex = 0;

							if( p.luma > 0 )
								this.chromaField = 0;
							else
								this.chromaField = 1;

							if( p.luma != p.chroma )
							{
								if( ( t.time - t.lastV < this.vPerTarget * 1.5 ) &&
									( t.time - t.lastV > this.vPerTarget * 0.5 ) )
									this.vPeriod = this.vPeriod * 0.75 + ( t.time - t.lastV ) * 0.25;

								t.lastV = t.time;

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

				if( p.count > 0 )
				{
					p.timeout -= 1.0 / sampleRate;

					if( p.timeout <= 0 )
						p.count = 0;
				}
			}
			else
			{
				p.luma = p.lumaPrev = 0;
				p.chroma = p.chromaPrev = 0;
				p.edge = false;
				p.count = 0;
			}

			this.hPeriod = this.hPeriod * ( 1.0 - 1.0 / sampleRate ) + this.hPerTarget * ( 1.0 / sampleRate );
			this.vPeriod = this.vPeriod * ( 1.0 - 1.0 / sampleRate ) + this.vPerTarget * ( 1.0 / sampleRate );

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
					( this.currLine.colors.length > 5 ) &&
					( this.currLine.maxPhase > 0 )
				)
				{
					this.port.postMessage( this.currLine );
				}

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

		return true
	}
}

registerProcessor( 'cv-decoder', CVDecoder );