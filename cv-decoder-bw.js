class CVDecoder extends AudioWorkletProcessor
{
	constructor( options )
	{
		super( options );

		let config = options.processorOptions;

		this.sig =
		{
			min: 0.0,
			max: 1.0,
		};

		this.hPhase = 0;
		this.vPhase = 0;

		this.pulse =
		{
			length: 0,
			timeout: 0,
			polarity: 0,
			prevPolarity: 0,
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

	process( inputs, outputs, parameters )
	{
		if( inputs[ 0 ].length != 2 )
			return;

		let lSamples = inputs[ 0 ][ 0 ];
		let rSamples = inputs[ 0 ][ 1 ];

		let s = this.sig;
		let p = this.pulse;
		let t = this.timing;

		let blank = false;

		for( let i = 0; i < lSamples.length; i++ )
		{
			t.time += 1;

			let sample = (lSamples[ i ] + rSamples[ i ])/2.0 + Math.random() * 0.01 - 0.005;

			if( sample < s.min ) s.min = sample;
			if( sample > s.max ) s.max = sample;

			s.min *= 1.0 - ( 1.0 / sampleRate );
			s.max *= 1.0 - ( 1.0 / sampleRate );

			if( s.min > -0.025 ) s.min = -0.025;
			if( s.max < 0.025 ) s.max = 0.025;

			let luma = ( sample * 2.0 - s.min ) / ( s.max - s.min ) * this.brightness * 255;

			if( this.currLine.colors.length < this.hPerTarget * 2.0 )
				this.currLine.colors.push(
					{
						phase: this.hPhase,
						r: Math.max( Math.min( Math.round( luma ), 255 ), 0 ),
						g: Math.max( Math.min( Math.round( luma ), 255 ), 0 ),
						b: Math.max( Math.min( Math.round( luma ), 255 ), 0 )
					}
				);

			this.currLine.maxPhase = this.hPhase;

			this.hPhase += 1.0 / this.hPeriod;
			this.vPhase += 1.0 / this.vPeriod;

			this.currLine.x2 = this.hPhaseToX( this.hPhase, this.vPhase, this.field );

			if( ( s.max - s.min ) > 0.1 )
			{
				if( sample < s.min * 0.5 )
					p.polarity = -1;
				else if( sample > s.max * 0.5 )
					p.polarity = 1;
				else
					p.polarity = 0;

				if( p.polarity != p.prevPolarity )
				{
					p.length = 0;
					p.prevPolarity = p.polarity;
					p.edge = true;
				}

				if( p.polarity != 0 )
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

							let pPhase = p.polarity < 0 ? 0 : 1;
							if( pPhase != this.field )
							{
								if( ( t.time - t.lastV < this.vPerTarget * 1.5 ) &&
									( t.time - t.lastV > this.vPerTarget * 0.5 ) )
									this.vPeriod = this.vPeriod * 0.75 + ( t.time - t.lastV ) * 0.25;

								t.lastV = t.time;
								this.vPhase = 0;
								this.field = pPhase;
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
				p.polarity = p.prevPolarity = 0;
				p.edge = false;
				p.count = 0;
			}

			this.hPeriod = this.hPeriod * ( 1.0 - 1.0 / sampleRate ) + this.hPerTarget * ( 1.0 / sampleRate );
			this.vPeriod = this.vPeriod * ( 1.0 - 1.0 / sampleRate ) + this.vPerTarget * ( 1.0 / sampleRate );

			if( this.hPhase >= 1.0 )
			{
				blank = true;
				this.hPhase -= 1.0;
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